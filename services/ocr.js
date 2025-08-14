// services/ocr.js
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);

export async function ocrPdfBuffer(buffer, { languages = process.env.OCR_LANG || 'ita+eng', optimize = '1' } = {}) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-'));
    const input = path.join(tmpDir, 'in.pdf');
    const output = path.join(tmpDir, 'out.pdf');

    await fs.writeFile(input, buffer);
    try {
        // maxBuffer alto per evitare stdout/stderr troppo lunghi
        await exec('ocrmypdf', [
            '--force-ocr',
            '--language', languages,
            '--rotate-pages',
            '--deskew',
            '--optimize', String(optimize),
            input, output
        ], { maxBuffer: 64 * 1024 * 1024 });

        const outBuf = await fs.readFile(output);
        return outBuf;
    } finally {
        // cleanup best-effort
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}