const path = require('path')
const fs = require('fs')
const { dependencies } = require('webpack')
const parser = require('@babel/parser'); // 把源代码转换AST的编译器
const traverse = require('@babel/traverse').default; //遍历语法树的工具
const generator = require('@babel/generator').default; //把转换后的语法树重新生成源代码的工具
const types = require('@babel/types'); //生成和判断节点的工具库

function toUnixSeq(filePath) {
  return filePath.replace(/\\/g, '/')
}

class Complication {
  constructor(options) {
    this.options = options
    this.options.context = this.options.context || toUnixSeq(process.cwd()) // current working
    this.fileDependencies = new Set()
    this.modules = []
    this.chunks = []
    this.assets = []
  }

  build(onCompiled) {
    let entry = {}
    // 5.根据配置中的 entry 找出入口文件
    if (typeof this.options.entry === 'string') {
      entry.main = this.options.entry
    } else {
      entry = this.options.entry
    }
    for (let entryName in entry) {
      // 获取入口文件的绝对路径
      let entryFilePath = path.posix.join(this.options.context, entry[entryName])
      // 把此文件添加到文件依赖列表中
      this.fileDependencies.add(entryFilePath)
      // 从入口文件出发，开始编译模块
      let entryModule = this.buildModule(entryName, entryFilePath)
      // 8.根据入口和模块之间的依赖关系，组装成一个个包含多个模块的 Chunk
      let chunk = {
        name: entryName, // 入口名
        entryModule, // 入口的模块
        modules: this.modules.filter(module => module.names.includes(entryName)) // 此入口使用到的所有模块
      }
      this.chunks.push(chunk)
    }

    const output = this.options.output
    // 9. 再把每个chunk 转成一个单独的文件，加入到输出列表
    this.chunks.forEach(chunk => {
      const outputFileName = output.filename.replace('[name]', chunk.name)
      this.assets[outputFileName] = getSourceCode(chunk)
    })

    onCompiled(
      null,
      {
        modules: this.modules,
        chunks: this.chunks,
        assets: this.assets
      },
      this.fileDependencies
    )

    // const error = null
    // const stats = {}
    // const fileDependencies = []
    // onCompiled(error, stats, fileDependencies)
  }

  /**
   * 
   * @param {*} entryName 入口的名称 main,entry1,entry2
   * @param {*} modulePath 模块的文件的绝对路径
   */
  buildModule(entryName, modulePath) {
    // 6. 从入口文件出发，调用所有配置的loader对模块进行转换
    let rawSourceCode = fs.readFileSync(modulePath, 'utf8') // 同步读取文件内容

    // 获取loader的配置规则
    const { rules } = this.options.module
    // 获取适用于当前模块的loader
    let loaders = []
    rules.forEach(rule => {
      if (modulePath.match(rule.test)) {
        loaders.push(...rule.use)
      }
    });

    // 经过所有loader转换后的代码
    // 通常情况下，先执行后面的loader，所以使用reducerRight
    const transformedSourceCode = loaders.reduceRight((sourceCode, loaderPath) => {
      const loaderFn = require(loaderPath)
      return loaderFn(sourceCode)
    }, rawSourceCode)
    // 获取modulePath的模块Id，一般是相对于工作目录的相对路径
    // ./src/xxx
    const moduleId = './' + path.posix.relative(this.options.context, modulePath)
    const module = {
      id: moduleId,
      names: [entryName], // 当前模块被哪些入口引用
      dependencies: new Set() // 当前模块依赖哪些模块
    }
    this.modules.push(module)

    // 经过loader转换，transformedSourceCode肯定是一个js字符串
    // 7.再找出该模块依赖的模块，再递归本步骤直到所有入口依赖的文件都经过了本步骤的处理
    const ast = parser.parse(transformedSourceCode, { sourceType: 'module' })

    traverse(ast, {
      CallExpression: ({ node }) => {
        // 如果调用的方法名是require的话，说明就要依赖一个其他模块
        if (node.callee.name === 'require') {
          // 依赖模块的名称：require的参数
          let depModuleName = node.arguments[0].value
          // 获取当前模块所在的路径，用于拼依赖模块的路径

          let dirName = path.posix.dirname(modulePath)
          // 依赖模块绝对路径：依赖的模块的绝对路径(不包含后缀)
          let depModulePath = path.posix.join(dirName, depModuleName)
          let { extensions } = this.options.resolve
          // 依赖模块真正路径：尝试添加后缀，找到真正的路径
          depModulePath = tryExtensions(depModulePath, extensions)

          this.fileDependencies.add(depModulePath)

          // 依赖模块id：相对于根目录的路径
          let depModuleId = './' + path.posix.relative(this.options.context, depModulePath)

          // 修改语法树
          node.arguments[0] = types.stringLiteral(depModuleId)
          // 把依赖的模块添加到当前模块的 dependencies 中
          module.dependencies.add({ depModuleId, depModulePath })
        }
      }
    })
    // 转换成源代码
    const { code } = generator(ast)
    // 把转换后的源码放在_source属性，用于后面写入文件
    module._source = code

    Array.from(module.dependencies).forEach(({ depModuleId, depModulePath }) => {
      //判断此模块是否已经编译过了，如果编译过了，则不需要重复编译
      const existModule = this.modules.find(module => module.id === depModuleId)

      if (existModule) {
        // 如果模块已经被编译过了，就只需要把新的入口添加到names中
        // names表示，当前模块被哪些入口所引用
        existModule.names.push(entryName)
      } else {
        // 递归编译module
        this.buildModule(entryName, depModulePath)
      }
    })
    return module
  }
}

function tryExtensions(modulePath, extensions) {
  // 如果此绝对路径已经手写上了后缀，就直接返回
  if (fs.existsSync(modulePath)) {
    return modulePath
  }
  // 不使用forEach，foreach 不能中断
  for (let i = 0; i < extensions.length; i++) {
    let filePath = modulePath + extensions[i];
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  throw new Error(`模块 ${modulePath} 未找到`)
}

function getSourceCode(chunk) {
  return `
  (() => {
    var modules = {
      ${chunk.modules
      .filter(module => module.id !== chunk.entryModule.id) // 过滤掉当前module
      .map(
        module => `
            "${module.id}": module => {
               ${module._source}
              }
            `
      )
    }  
    };
    var cache = {};
    function require(moduleId) {
      var cachedModule = cache[moduleId];
      if (cachedModule !== undefined) {
        return cachedModule.exports;
      }
      var module = cache[moduleId] = {
        exports: {}
      };
      modules[moduleId](module, module.exports, require);
      return module.exports;
    }
    var exports = {};
    (() => {
      ${chunk.entryModule._source}
    })();
  })();
  `;
}

module.exports = Complication