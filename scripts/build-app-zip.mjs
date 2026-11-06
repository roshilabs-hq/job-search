// Builds claude-app/job-search-il.zip for uploading to claude.ai (Customize > Skills > Upload a skill).
// The skill folder must sit at the top level of the zip. The zip is attached to each GitHub release.
// Entries are written with "/" separators: Windows PowerShell's Compress-Archive writes "\", which other tools misread.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/util.mjs';

const src = path.join(ROOT, 'claude-app', 'job-search-il');
const out = path.join(ROOT, 'claude-app', 'job-search-il.zip');
fs.rmSync(out, { force: true });
const files = fs.readdirSync(src, { recursive: true }).filter(f => fs.statSync(path.join(src, f)).isFile());
const adds = files.map(f => `[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, '${path.join(src, f)}', 'job-search-il/${f.replace(/\\/g, '/')}') | Out-Null`).join('\n');
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [IO.Compression.ZipFile]::Open('${out}', 'Create')
${adds}
$z.Dispose()`], { stdio: 'inherit' });
console.log(out);
