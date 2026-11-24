import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-11-23T12:00:00Z')
const HOUR = 3_600_000

const BAND = {
  plugin: 'cockpit',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// 5h window: 2h gone (40%), 60% used -> on pace for 150%: runs out early.
// 7d window: 3.5d gone (50%), 20% used -> on pace for ~40%.
const seed = (on: any) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - HOUR,
      context: { tokens: 76_000, window: 200_000, percent: 38 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 60, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
        { kind: 'seven_day', percentUsed: 20, resetsAt: new Date(NOW + 84 * HOUR).toISOString() },
      ],
      cost: { usd: 0.42 },
    },
  }))
  on('process.run', (_: any, e: any) => ({
    value: {
      exitCode: 0,
      stdout: e.argv.includes('status')
        ? '# branch.head main\n# branch.ab +1 -0\n1 .M N... 100644 100644 100644 a b CLAUDE.md\n'
        : '/repo\n.git\n.git\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
}

test('the band shows model, context, limits with pace, and git', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /Opus 5\.5/ }))?.text).toBe('Opus 5.5')
    expect((await ui.find({ type: 'Text', text: /38%/ }))?.text).toContain('38%')
    expect(await ui.find({ type: 'Text', text: /⚠/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /main/ }))?.text).toBe('main')
    expect((await ui.find({ type: 'Text', text: /±1/ }))?.text).toContain('±1')
    await ui.unmount()
  }
})
