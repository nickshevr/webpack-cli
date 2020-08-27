#!/usr/bin/env node

const assert = require('assert');
const { unlinkSync, renameSync } = require('fs');
const { resolve } = require('path');
// eslint-disable-next-line node/no-unpublished-require
const { appendDataIfFileExists, runAndGetWatchProc, copyFileAsync } = require('../../test/utils/test-utils');

console.log('\n============================ SINGLE COMPILATION ============================\n');

const testEntryFiles = [
    {
        name: 'index.js',
        fp: resolve(__dirname, 'index.js'),
        cpFp: null,
    },
];

/**
 * Make a copy of each file
 * @returns {void}
 */
async function setup() {
    await testEntryFiles.forEach(async (file) => {
        // eslint-disable-next-line
        file.cpFP = await copyFileAsync(__dirname, file.name);
    });
}

/**
 * Remove symlinks, restore file
 * @returns {void}
 */
async function teardown() {
    await testEntryFiles.forEach(async (file) => {
        try {
            unlinkSync(file.fp);
        } catch (e) {
            console.warn('could not remove the file:' + file.fp + '\n' + e.message);
        } finally {
            renameSync(file.cpFP, file.fp);
        }
    });
}

// eslint-disable-next-line
(async () => {
    try {
        await setup();

        // Spawn one process in watch mode and fill up a buffer of results
        const webpackProc = runAndGetWatchProc(__dirname, ['--watch']);
        const dataBuffer = [];

        const id = setInterval(() => {
            // Close process if time is over 5s
            if (process.uptime() > 5) {
                assert.strictEqual(true, false, 'Test for child compilation hang, exiting');
                webpackProc.kill('SIGINT');
            } else if (dataBuffer.length > 1) {
                webpackProc.kill('SIGINT');
                clearInterval(id);
                return;
            }
            appendDataIfFileExists(__dirname, testEntryFiles[0].name, '//junk-comment');
        }, 1000);

        // Array based configuration with child compilation
        webpackProc.stdout.on('data', (data) => {
            data = data.toString();
            dataBuffer.push(data);
            // Close process if buffer is full enough
            if (dataBuffer.length > 1) {
                webpackProc.kill('SIGINT');
                return;
            }
        });

        // Buffer should have compiled equal amount of each compilation and have diff output directories
        // eslint-disable-next-line
        webpackProc.stderr.on('close', async () => {
            assert.strictEqual(dataBuffer.length >= 1, true, 'expected single configuration to re-compile');
            await teardown();
            webpackProc.kill('SIGINT');
        });
    } catch (e) {
        // Nothing
    }
})();
