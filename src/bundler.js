const fs = require("fs-extra");
const path = require("path");
const winston = require("winston");
const { format, transports } = require("winston");
const { Bar } = require("cli-progress");
const ora = require("ora");
const cpy = require("cpy");
const chalk = require("chalk");
const { summarise } = require("./prompt");

const label = "js-bundler";

const logger = winston.createLogger({
  transports: [
    new transports.Console({
      format: format.combine(
        format.label({ label: label }),
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.colorize(),
        format.printf((info) => `[${info.label}] |${info.timestamp}| ${info.level}: ${info.message}`)
      ),
    }),
  ],
});

const units = ["B", "kB", "MB", "GB"];

async function getAllFiles(dirPath, allFiles = []) {
  let currentFiles = await fs.readdir(dirPath);

  for (let i = 0; i < currentFiles.length; i++) {
    const currentPath = path.join(dirPath, currentFiles[i]);
    isDirectory = (await fs.stat(currentPath)).isDirectory();
    if (isDirectory) allFiles = await getAllFiles(currentPath, allFiles);
    else allFiles.push(currentPath);
  }

  return allFiles;
}

async function getDirInfo(dirPath) {
  files = await getAllFiles(dirPath);
  let totalSize = 0;
  files.forEach((filePath) => (totalSize += fs.statSync(filePath).size));
  return { fileCount: files.length, size: totalSize };
}

async function report(progress, bar) {
  const { completedSize: totalWritten, start, unit } = progress;
  const bytesWritten = totalWritten - (module.currentSize || 0);
  module.currentSize = totalWritten;

  const speed = Math.round(bar.value / ((Date.now() - start) / 1000));
  bar.increment(bytesWritten, {
    speed: `${speed} ${unit}`,
  });
}

module.exports = async function (options) {
  const { output, src, modules, fast } = options;

  try {
    const srcLoc = `${output}/${src.split("/").pop()}`;
    const modulesLoc = `${output}/${modules.split("/").pop()}`;
    console.log();

    //Setup output folder(s)
    try {
      logger.info("Peparing bundle output location.");
      await fs.stat(output);
      logger.info("Output folder found.");
      await fs.remove(output);
      fs.mkdir(output);
      fs.mkdir(srcLoc);
      fs.mkdir(modulesLoc);
    } catch (error) {
      logger.warn(`Output location: '${output}' not found.`);
      logger.info(`Creating:\n${output}\n${srcLoc}\n${modulesLoc}`);
      fs.mkdir(output);
      fs.mkdir(srcLoc);
      await fs.mkdir(modulesLoc);
      logger.info("Created output location.");
    }

    const spinner = ora();

    //Progress bar
    if (!fast) {
      spinner.start("Preparing...");
      var start = Date.now();
      const srcInfo = await getDirInfo(src);
      const modulesInfo = await getDirInfo(modules);
      var totalFiles = srcInfo.fileCount + modulesInfo.fileCount;
      var totalSize = srcInfo.size + modulesInfo.size;
      const index = Math.floor(totalSize.toString().length / 3);
      spinner.stop();
      logger.info("Calculations complete.");

      var unit = units[index];

      logger.info("Bundling...");
      console.log();

      const bar = new Bar({
        format: `Bundle Progress | ${chalk.cyan("{bar}")} | {percentage}% || @{speed} || ETA: {eta}s`,
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
      });

      bar.start(totalSize, 0, {
        speed: "N/A",
      });

      const bundleStart = Date.now();
      await cpy([src, modules], output, { parents: true }).on("progress", (progress) => report({ bundleStart, unit, ...progress }, bar));
      bar.update(totalSize);
      bar.stop();
      summarise(true, `[${label}]:: Bundled to '${output}'`, Date.now() - start, totalFiles, totalSize, unit);
    } else {
      spinner.start("Bundling...");
      await cpy([src, modules], output, { parents: true });
      spinner.stop();
      logger.info("Bundle Complete.");
    }
  } catch (error) {
    if (!fast) summarise(false, `[${label}]:: ${error}`, Date.now() - start, totalFiles, totalSize, unit);
    logger.error("Bundle FAILED. Closing...");
  }
};
