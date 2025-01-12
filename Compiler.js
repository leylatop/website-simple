const { SyncHook } = require('tapable');
const fs = require('fs')
const path = require('path')
const Complication = require('./Complication')

class Compiler {
  constructor(options) {
    this.options = options
    this.hooks = {
      run: new SyncHook(),
      done: new SyncHook(),
    };
  }

  run(callback) {
    this.hooks.run.call();
    const onCompiled = (err, stats, fileDependencies=[]) => {
      // 10. 在确定好输出内容后，根据配置确定输出的路径和文件名，把文件内容写入到文件系统
      const { assets } = stats
      for(let filename in assets) {
        let filePath = path.posix.join(this.options.output.path, filename)
        fs.writeFileSync(filePath, assets[filename], 'utf8')
      }
      callback(err, {
        toJson: () => stats
      })
      // fileDependencies指的是本次打包涉及哪些文件
      // 监听这些文件的变化，当文件发生变化时，开启新的编译
      fileDependencies.forEach(file => {
        fs.watch(file, () => {
          this.compile(onCompiled)
        })
      })
    }
    this.compile(onCompiled)
    this.hooks.done.call();
  }

  compile(onCompiled) {
    const complication = new Complication(this.options)
    complication.build(onCompiled)
  }
}

module.exports = Compiler;