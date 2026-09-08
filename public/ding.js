;(function () {
  const DING = {
    freq: 700,
    partials: [
      [1, 1],
      [2, 0.22],
      [3, 0.07],
    ],
    decay: 0.62,
    cutoff: 9400,
    shimmer: 1.3,
    volume: 0.25,
  }

  let ctx

  function ding() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()

    const at = ctx.currentTime + 0.01

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = DING.cutoff
    filter.Q.value = 0.5
    filter.connect(ctx.destination)

    for (const partial of DING.partials) {
      const ratio = partial[0]
      const decay = DING.decay / (1 + 0.4 * (ratio - 1))
      const level = DING.volume * partial[1] * (ratio === 1 ? 1 : DING.shimmer)
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.value = DING.freq * ratio

      amp.gain.setValueAtTime(0.0001, at)
      amp.gain.exponentialRampToValueAtTime(level, at + 0.006)
      amp.gain.exponentialRampToValueAtTime(0.0001, at + decay)

      osc.connect(amp).connect(filter)
      osc.start(at)
      osc.stop(at + decay + 0.02)
    }
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
