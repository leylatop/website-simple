const webpack = require('./webpack-simple');
const config = require('./webpack.config');
const fs = require('fs');

const compiler = webpack(config);

// 4.执行对象的 run 方法开始执行编译
compiler.run((err, stats) => {
  console.log('====================================');
    console.log(stats.toJson({
        modules:true,//每个文件都是一个模块
        chunks:true,//打印所有的代码块，模块的集合会成一个代码块
        assets:true//输出的文件列表
    }));
    console.log('====================================');
    let statsString = JSON.stringify(
        stats.toJson({
            modules:true,//每个文件都是一个模块
            chunks:true,//打印所有的代码块，模块的集合会成一个代码块
            assets:true//输出的文件列表
        })
    );
    fs.writeFileSync('./myStats.json',statsString);
});