#! /usr/bin/env node

// Suppress harmless npmlog@5 circular-dependency warning (transitive via appium-adb).
// Must run before requiring appium-adb. Lets every other warning through.
const _emit = process.emit;
process.emit = function (name, data, ...rest) {
  if (
    name === 'warning' &&
    data &&
    data.name === 'Warning' &&
    /padLevels/.test(data.message)
  ) {
    return false;
  }
  return _emit.call(this, name, data, ...rest);
};

const { spawn } = require('child_process');
const { ADB } = require('appium-adb');

// Run `adb -s <udid> <args>` and resolve when it exits.
function runOnDevice(adbPath, udid, args, interactive) {
  return new Promise((resolve) => {
    const argv = ['-s', udid, ...args];
    if (interactive) {
      // Single device: attach device TTY directly (real interactive shell).
      const child = spawn(adbPath, argv, { stdio: 'inherit' });
      child.on('close', resolve);
      child.on('error', (err) => {
        console.log('error for device:', udid, err);
        resolve();
      });
    } else {
      // Multiple devices: buffer and label output per device.
      const child = spawn(adbPath, argv);
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      child.on('close', () => {
        console.log(udid, ':', out.trim());
        resolve();
      });
      child.on('error', (err) => {
        console.log('error for device:', udid, err);
        resolve();
      });
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const adb = await ADB.createADB();
  const devices = await adb.getConnectedDevices();

  if (devices.length === 0) {
    console.log('No connected devices.');
    return;
  }

  const adbPath = adb.executable.path;
  // Interactive (inherit stdio) only makes sense with a single device.
  const interactive = devices.length === 1;

  if (interactive) {
    await runOnDevice(adbPath, devices[0].udid, args, true);
  } else {
    await Promise.all(
      devices.map((d) => runOnDevice(adbPath, d.udid, args, false))
    );
  }
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
