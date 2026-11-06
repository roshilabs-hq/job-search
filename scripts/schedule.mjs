// Windows scheduled tasks for the agent: daily runs (default 10:00 and 18:00) and a weekly digest (Sunday 08:00).
//   node scripts/schedule.mjs on [HH:MM ...]   create or replace the tasks
//   node scripts/schedule.mjs off              remove them ("turn everything off")
//   node scripts/schedule.mjs status           show whether they exist and the next run time
// Runs hidden (wscript + run-hidden.vbs), so no console window opens and closing one can't stop a run.
// If the computer was off at the scheduled time, the run starts as soon as it is back on.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../lib/util.mjs';

const DAILY = 'Job Search Kit';
const WEEKLY = 'Job Search Kit - Weekly';
const DIR = path.join(ROOT, 'scripts', 'windows');

const ps = script => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
  Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8' }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;

export function scheduleOn(times = ['10:00', '18:00']) {
  if (process.platform !== 'win32') throw new Error('the schedule is set up for Windows only in this version');
  if (!times.every(t => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error(`times must look like 10:00, got: ${times.join(' ')}`);
  const runner = path.join(DIR, 'run-hidden.vbs');
  ps(`
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$daily = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + ${q(runner)} + '"') -WorkingDirectory ${q(DIR)}
$triggers = @(${times.map(t => `New-ScheduledTaskTrigger -Daily -At ${q(t)}`).join('; ')})
Register-ScheduledTask -TaskName ${q(DAILY)} -Action $daily -Trigger $triggers -Settings $settings -Principal $principal -Description 'Job search agent: daily search and email' -Force | Out-Null
$weekly = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + ${q(runner)} + '" run-weekly.cmd') -WorkingDirectory ${q(DIR)}
Register-ScheduledTask -TaskName ${q(WEEKLY)} -Action $weekly -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '08:00') -Settings $settings -Principal $principal -Description 'Job search agent: weekly digest' -Force | Out-Null`);
  return status();
}

export function scheduleOff() {
  ps(`foreach ($n in @(${q(DAILY)}, ${q(WEEKLY)})) { Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue }`);
  return status();
}

export function status() {
  return ps(`foreach ($n in @(${q(DAILY)}, ${q(WEEKLY)})) {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if ($t) { $i = $t | Get-ScheduledTaskInfo; "$n : on, next run $($i.NextRunTime)" } else { "$n : off" } }`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (process.argv[1]?.endsWith('schedule.mjs')) {
  try {
    console.log(cmd === 'on' ? scheduleOn(rest.length ? rest : undefined) : cmd === 'off' ? scheduleOff() : status());
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
