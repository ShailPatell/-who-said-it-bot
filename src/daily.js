// Daily scheduling helpers. Time zone aware (handles daylight saving) with no extra dependencies.

function localNow(timezone, now = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  }
  
  // "15:00" -> 900. Returns null if it isn't a valid HH:MM.
  function parseTime(str) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(str).trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  
  // Fire once per local day, within a short grace window after the target time
  // (covers brief restarts without sending a surprise round hours late).
  function shouldFire(now, targetMinutes, lastDate, graceMinutes = 10) {
    return now.date !== lastDate && now.minutes >= targetMinutes && now.minutes < targetMinutes + graceMinutes;
  }
  
  function startDailyScheduler({ timezone, time, lastDate, markFired, onFire, intervalMs = 30_000, nowFn = () => new Date() }) {
    const target = parseTime(time);
    if (target === null) throw new Error(`DAILY_TIME "${time}" isn't valid. Use HH:MM, like 15:00.`);
    localNow(timezone); // throws RangeError for a bad time zone name
  
    let last = lastDate ?? null;
    const tick = async () => {
      const now = localNow(timezone, nowFn());
      if (!shouldFire(now, target, last)) return;
      last = now.date; // set first so a slow or failed send can't double-fire
      try {
        markFired(now.date);
        await onFire(now.date);
      } catch (err) {
        console.error('Daily round failed:', err);
      }
    };
    const timer = setInterval(tick, intervalMs);
    tick();
    return () => clearInterval(timer);
  }
  
  module.exports = { localNow, parseTime, shouldFire, startDailyScheduler };