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
// Returns what the band's buttons asked of the engine.
const seed = (on: any, { isRepo = true } = {}) => {
  const fills: string[] = []
  const opens: string[] = []
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
      exitCode: isRepo || e.argv[0] === 'gh' ? 0 : 128,
      stdout:
        e.argv[0] === 'gh'
          ? JSON.stringify(PR)
          : e.argv.includes('status')
            ? '# branch.head main\n# branch.ab +1 -0\n1 .M N... 100644 100644 100644 a b CLAUDE.md\n'
            : '/repo\n.git\n.git\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('agent.list', () => ({ value: [AGENT] }))
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('ui.open', (_: any, e: any) => {
    opens.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('prompt.fill', (_: any, e: any) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  // Beneath the plugins: the ring moves where it was asked.
  on('ui.focus', { plugin: '*' }, () => ({}))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('ui.toast', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  return { fills, opens }
}

const PR = {
  number: 42,
  title: 'Add cockpit',
  url: 'https://github.com/o/r/pull/42',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: 'CHANGES_REQUESTED',
  mergeable: 'MERGEABLE',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' },
  ],
  comments: [{ author: { login: 'rev' }, body: 'Please rename this.', createdAt: '2026-11-23T10:00:00Z' }],
  reviews: [],
}

const AGENT = {
  id: 'a1',
  description: 'Explore repo',
  type: 'Explore',
  status: 'running',
  kind: 'local_agent',
  taskStatus: 'running',
  label: 'Explore repo',
  startTime: NOW - 120_000,
  cwd: '/repo',
  model: 'Haiku 5.5',
  effort: 'low',
  contextWindowSize: 200_000,
  tokenCount: 50_000,
  tokenSamples: [1000, 5000, 20000, 50000],
  cost: { usd: 0.05 },
  hasRow: true,
}

const PANE = {
  plugin: 'cockpit',
  component: 'Pane',
  requestId: 'cockpit',
  props: {
    title: 'Cockpit',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

test('the band and pane show PR, CI and running agents', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  // The engine stamps origin and presentation on a real run.
  await $.command.run({ command: 'cockpit', args: '' } as Parameters<typeof $.command.run>[0])

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: /#42/ }))?.text).toBe('#42')
    expect((await band.find({ type: 'Text', text: /✗CI/ }))?.text).toContain('✗CI')
    expect((await band.find({ type: 'Text', text: /⚙1/ }))?.text).toBe('⚙1')
    await band.unmount()

    const pane = await $.ui.mount({ ...PANE, surface })
    expect(await pane.find({ type: 'Text', text: /changes requested/ })).toBeTruthy()
    expect(await pane.find({ type: 'Text', text: /Explore repo/ })).toBeTruthy()
    expect(await pane.find({ type: 'Button', key: 'fix-ci' })).toBeTruthy()
    expect(await pane.find({ type: 'Button', key: 'compact' })).toBeTruthy()
    await pane.unmount()
  }
})

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

test('band buttons fill the prompt and open the pane on a section', async ($, on) => {
  const { fills, opens } = seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'cockpit', args: '' } as Parameters<typeof $.command.run>[0])
  opens.length = 0

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'band-fix-ci' })
  expect(fills.at(-1)).toBe('/fix-ci 42')
  await band.press({ key: 'band-comments' })
  expect(fills.at(-1)).toContain('PR #42')

  await band.press({ key: 'band-ctx' })
  expect(opens).toEqual(['cockpit'])
  let pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Button', key: 'compact' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /Explore repo/ })).toBeFalsy()
  await pane.unmount()

  await band.press({ key: 'band-agents' })
  pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /Explore repo/ })).toBeTruthy()
  expect(await pane.find({ type: 'Button', key: 'compact' })).toBeFalsy()
  await pane.unmount()

  await band.press({ key: 'band-hide' })
  expect(await band.find({ type: 'Text', text: /Opus 5\.5/ })).toBeFalsy()
  await band.unmount()
})

test('band segments toggle detail rows that respect maxRows', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /of window gone/ })).toBeFalsy()
  await band.press({ key: 'band-limits' })
  expect(await band.find({ type: 'Text', text: /runs out in/ })).toBeTruthy()
  await band.press({ key: 'band-git' })
  expect(await band.find({ type: 'Text', text: /CLAUDE\.md/ })).toBeTruthy()
  await band.press({ key: 'band-limits' })
  expect(await band.find({ type: 'Text', text: /runs out in/ })).toBeFalsy()
  await band.unmount()

  // One row of room: the main row alone.
  const short = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 1 } })
  expect(await short.find({ type: 'Text', text: /CLAUDE\.md/ })).toBeFalsy()
  await short.unmount()
})

test('hotkey hints show only once the band holds the focus', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Button', key: 'band-ctx' }))?.props.hotkey).toBeUndefined()

  await $.ui.focus({
    component: 'AbovePrompt',
    requestId: 'above-prompt',
    plugin: 'cockpit',
    element: 'band-ctx',
    origin: { kind: 'plugin', name: 'cockpit' },
  } as Parameters<typeof $.ui.focus>[0])
  expect((await band.find({ type: 'Button', key: 'band-ctx' }))?.props.hotkey).toBe('c')
  expect((await band.find({ type: 'Button', key: 'band-git' }))?.props.hotkey).toBe('g')

  await $.prompt.submit({ text: 'hi' } as Parameters<typeof $.prompt.submit>[0])
  expect((await band.find({ type: 'Button', key: 'band-ctx' }))?.props.hotkey).toBeUndefined()
  await band.unmount()
})

test('the band stays above the prompt while a turn runs', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, isWorking: true } })
    expect((await band.find({ type: 'Text', text: /Opus 5\.5/ }))?.text).toBe('Opus 5.5')
    expect(await band.find({ type: 'Button', key: 'band-ctx' })).toBeTruthy()
    await band.unmount()
  }
})

const mountAt = ($: any, bodyColumns: number) =>
  $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns } })

const buttonKeys = async (band: any) =>
  (await band.findAll({ type: 'Button' })).map((b: any) => b.key as string)

test('cost and last turn live in the pane, not the band', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const band = await mountAt($, 140)
  expect(await band.find({ type: 'Text', text: /\$0\.42/ })).toBeFalsy()
  expect(await band.find({ type: 'Text', text: /│/ })).toBeFalsy()
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /\$0\.42/ })).toBeTruthy()
  await pane.unmount()
})

test('the 7d limit is a coloured figure without a bar', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const band = await mountAt($, 140)
  const sevenDay = await band.find({ type: 'Text', text: /^20%$/ })
  expect(sevenDay?.props.color).toBe('success')
  expect((await band.find({ type: 'Text', text: /60%/ }))?.text).toContain('▰')
  await band.unmount()
})

test('line 1 narrows in steps and keeps the context figure', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const at = async (cols: number) => {
    const band = await mountAt($, cols)
    const ctx = (await band.find({ type: 'Button', key: 'band-ctx' }))?.text ?? ''
    const limits = (await band.find({ type: 'Button', key: 'band-limits' }))?.text ?? ''
    const keys = await buttonKeys(band)
    await band.unmount()
    return { ctx, limits, keys }
  }

  const full = await at(140)
  expect(full.limits).toContain('▰')
  // Limits sit on line 1, before the git segment of line 2.
  expect(full.keys.indexOf('band-limits')).toBeLessThan(full.keys.indexOf('band-git'))

  const noBar = await at(66)
  expect(noBar.limits).not.toContain('▰')
  expect(noBar.ctx).toMatch(/[▰▱]{14}/)

  const shortBar = await at(60)
  expect(shortBar.ctx).toMatch(/ [▰▱]{8} /)

  const moved = await at(50)
  expect(moved.keys.indexOf('band-limits')).toBeGreaterThan(moved.keys.indexOf('band-git'))

  for (const step of [full, noBar, shortBar, moved]) {
    expect(step.ctx).toContain('38%')
    expect(step.ctx).toContain('76k')
  }
})

test('hotkey hints count toward the width', async ($, on) => {
  seed(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const band = await mountAt($, 74)
  expect((await band.find({ type: 'Button', key: 'band-limits' }))?.text).toContain('▰')
  await $.ui.focus({
    component: 'AbovePrompt',
    requestId: 'above-prompt',
    plugin: 'cockpit',
    element: 'band-ctx',
    origin: { kind: 'plugin', name: 'cockpit' },
  } as Parameters<typeof $.ui.focus>[0])
  expect((await band.find({ type: 'Button', key: 'band-limits' }))?.text).not.toContain('▰')
  await band.unmount()
})

test('outside a git repository line 2 still holds the menu', async ($, on) => {
  seed(on, { isRepo: false })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const band = await mountAt($, 140)
  const keys = await buttonKeys(band)
  expect(keys).not.toContain('band-git')
  expect(keys).toContain('cockpit-open')
  expect(keys).toContain('band-hide')
  await band.unmount()
})
