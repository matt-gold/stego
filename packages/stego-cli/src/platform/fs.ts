import fs from "node:fs";

export const fileSystem = {
  existsSync: fs.existsSync,
  readFileSync: fs.readFileSync,
  writeFileSync: fs.writeFileSync,
  mkdirSync: fs.mkdirSync,
  readdirSync: fs.readdirSync,
  statSync: fs.statSync,
  cpSync: fs.cpSync,
  copyFileSync: fs.copyFileSync,
  mkdtempSync: fs.mkdtempSync,
  rmSync: fs.rmSync
};
