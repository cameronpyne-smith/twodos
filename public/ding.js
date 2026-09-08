;(function () {
  let ctx

  function tone(at, freq, peak, decay) {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = freq

    amp.gain.setValueAtTime(0.0001, at)
    amp.gain.exponentialRampToValueAtTime(peak, at + 0.006)
    amp.gain.exponentialRampToValueAtTime(0.0001, at + decay)

    osc.connect(amp).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + decay + 0.02)
  }

  function ding() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()

    const at = ctx.currentTime + 0.01

    tone(at, 987.77, 0.14, 0.26)
    tone(at, 1975.53, 0.025, 0.16)
    tone(at + 0.085, 1318.51, 0.13, 0.42)
    tone(at + 0.085, 2637.02, 0.022, 0.22)
  }

  document.addEventListener('click', function (event) {
    const target = event.target
    const tick = target && target.closest ? target.closest('.tick') : null
    if (!tick) return

    const row = tick.closest('li')
    if (!row || row.classList.contains('done')) return

    try {
      ding()
    } catch (_) {}
  })
})()
