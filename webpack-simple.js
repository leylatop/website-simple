const Compiler = require('./Compiler');

function webpack(config) {
  //1.初始化参数：从配置文件和 Shell 语句中读取并合并参数,得出最终的配置对象
  const argv = process.argv.slice(2); //[0node.exe文件路径,1 执行脚本.js,xxxx]
  // node webpack.js --mode=development
  // shellOptions = {mode:'development'}
  const shellOptions = argv.reduce((options, option) => {
    const [key, value] = option.split('=');
    options[key.slice(2)] = value; // 去掉 -- 
    return options;
  }, {});
  // 合并参数
  const finalOptions = {...config, ...shellOptions};

  // 2.用上一步得到的参数初始化 Compiler 对象
  const compiler = new Compiler(finalOptions);

  // 3.加载所有配置的插件
  finalOptions.plugins.forEach(plugin => {
    plugin.apply(compiler);
  });

  return compiler;
}

module.exports = webpack;