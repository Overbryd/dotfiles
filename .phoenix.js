Phoenix.set({
  daemon: false,
  openAtLogin: true
});

const log = Phoenix.log;
const FULLHD = {
  width: 1920,
  height: 1080,
};
const IGNORE_WINDOWS = [
  // ignore Microsoft Teams notification windows which are invisible, and should not be managed
  new RegExp('^Microsoft Teams Notification$'),
]

class WindowContainer {
  constructor() {
    this.stack = [];
    this.windowDidCloseHandler = new Event('windowDidClose', (window) => this.removeWindow(window))
  }

  debug(indent) {
    indent = indent || '';
    log(`${indent}${this.constructor.name}: ${this.stack.length}`);
    for (const window of this.stack) {
      log(`${indent}${window}: [${window.app().name()}][${window.title()}]`);
    }
  }

  has(window) {
    if (!window)
      false;
    return !!this.stack.find(instance => instance.hash() === window.hash());
  }

  stackHead() {
    return this.stack[0];
  }

  removeWindow(window, opts) {
    if (!window)
      return;
    opts = opts || {}
    this.stack = this.stack.filter(instance => instance.hash() !== window.hash());
    if (opts.render !== false)
      this.render();
  }

  unshiftWindow(window, opts) {
    if (!window)
      return;
    opts = opts || {}
    if (this.has(window))
      return;
    this.stack.unshift(window);
    if (opts.render !== false)
      this.render();
  }

  pushWindow(window, opts) {
    if (!window)
      return;
    opts = opts || {}
    if (this.has(window))
      return;
    this.stack.push(window);
    if (opts.render !== false)
      this.render();
  }

  render() {}
}

class FramedContainer extends WindowContainer {
  constructor(frame) {
    super();
    this.frame = frame;
  }

  render() {
    for (const [i, window] of this.stack.reverse().entries()) {
      window.setFrame({
        x: this.frame.x,
        y: this.frame.y,
        width: this.frame.width,
        height: this.frame.height,
      });
    }
  }
}

class SingleFramedContainer extends FramedContainer {
  pushWindow(window, opts) {
    super.pushWindow(window, opts);
    opts = opts || {};
    for (const instance of this.stack) {
      if (instance.hash() !== window.hash())
        this.removeWindow(instance);
    }
  }

  unshiftWindow(window, opts) {
    super.unshiftWindow(window, opts);
    opts = opts || {};
    for (const instance of this.stack) {
      if (instance.hash() !== window.hash())
        this.removeWindow(instance);
    }
  }
}

class VerticalContainer extends FramedContainer {
  render() {
    const windowHeight = Math.floor(this.frame.height / this.stack.length);
    for (const [i, window] of this.stack.entries()) {
      window.setFrame({
        x: this.frame.x,
        y: this.frame.y + i * windowHeight,
        width: this.frame.width,
        height: windowHeight,
      });
    }
  }
}

class ContainerManager {
  constructor() {
    this.containers = new Map();
  }

  debug(indent) {
    indent = indent || '';
    log(`${indent}${this.constructor.name}: ${[...this.containers.keys()].join(', ')}`);
    for (const [name, container] of this.containers) {
      log(`${indent}${name}:`)
      container.debug(indent + '  ');
    }
  }

  setupContainer(screen, name, containerCallback) {
    const screenFrame = screen.flippedVisibleFrame();
    const frame = containerCallback(screen, screenFrame);
    const container = new frame.handler({name: name, ...frame});
    this.containers.set(name, container);
  }

  pushFocused(name) {
    const window = Window.focused();
    this.pushWindow(window, name);
  }

  unshiftFocused(name) {
    const window = Window.focused();
    this.unshiftWindow(window, name);
  }

  unshiftWindow(window, name, render) {
    render = render === undefined || render;
    for (const [name, container] of this.containers) {
      container.removeWindow(window, {render: false});
    }
    const container = this.containers.get(name);
    container.unshiftWindow(window, {render: false});
    if (render) this.render();
  }

  pushWindow(window, name, render) {
    render = render === undefined || render;
    for (const [name, container] of this.containers) {
      container.removeWindow(window, {render: false});
    }
    const container = this.containers.get(name);
    container.pushWindow(window, {render: false});
    if (render) this.render();
  }

  swapFocused(targetContainerName, render) {
    render = render === undefined || render;
    const window = Window.focused();
    const targetContainer = this.containers.get(targetContainerName);
    if (!targetContainer)
      return;
    let currentContainerName;
    for (const [name, container] of this.containers) {
      if (container.has(window)) {
        currentContainerName = name;
        break;
      }
    }
    if (currentContainerName === targetContainerName)
      return;
    const swapWindow = targetContainer.stackHead();
    this.unshiftWindow(window, targetContainerName, false);
    if (swapWindow !== undefined && currentContainerName)
      this.unshiftWindow(swapWindow, currentContainerName, false);
    if (render) this.render();
  }

  render() {
    for (const [name, container] of this.containers) {
      container.render();
    }
  }
}

class SpaceManager {
  static spaceManagers = new Map();

  static active() {
    const space = Space.active();
    return SpaceManager.spaceManagers.get(space.hash());
  }

  static add(screen, space, containers) {
    const spaceManager = new SpaceManager(screen, space, containers);
    spaceManager.setup();
    SpaceManager.spaceManagers.set(space.hash(), spaceManager);
  }

  static debug(indent) {
    indent = indent || '';
    for (const [key, spaceManager] of SpaceManager.spaceManagers) {
      log(`${indent}${this.name}[${key}]:`);
      spaceManager.containerManager.debug(indent + '  ');
    }
  }

  constructor(screen, space, containerSpec) {
    this.screen = screen;
    this.space = space;
    this.containerManager = new ContainerManager();
    this.containerSpec = containerSpec;
  }

  setup() {
    const windows = this.space.windows();
    const affinityRules = [
      (window) => { return window.hash() == Window.focused().hash() ? 'main' : null}
    ];

    for (const containerSpec of this.containerSpec.values()) {
      this.containerManager.setupContainer(this.screen, containerSpec.name, containerSpec.containerCallback);
      const affinity = containerSpec.affinity || [];
      for (const [appName, windowTitle] of affinity) {
        affinityRules.push((window) => {
          return (
            window.app().name().match(new RegExp(appName)) && window.title().match(new RegExp(windowTitle))
          ) ? containerSpec.name : null;
        })
      }
    }
    const containerNames = [...this.containerManager.containers.keys()].filter(name => name !== 'main');

    for (const i in this.space.windows()) {
      const window = this.space.windows()[i];
      if (IGNORE_WINDOWS.find(regex => { return window.title().match(regex)})) {
        log(`ignoring [${window.app().name()}][${window.title()}]`);
        continue;
      }
      const affinityRule = affinityRules.find(rule => rule(window));
      const containerName = affinityRule && affinityRule(window) || containerNames[i % containerNames.length];
      log(`[${window.app().name()}][${window.title()}] assigned to ${containerName}`);
      this.containerManager.pushWindow(window, containerName, false);
    }
    this.containerManager.render();
  }
}

function setupOneScreen() {
  if (!!SpaceManager.active())
    return;
  const screen = Screen.main();
  for (const i in Space.all()) {
    const space = Space.all()[i];
    SpaceManager.add(screen, space, [
      {
        name: 'main',
        containerCallback: (screen, screenFrame) => {
          return {
            handler: SingleFramedContainer,
            x: screenFrame.x + screenFrame.width / 2 - FULLHD.width / 2,
            y: screenFrame.y,
            width: FULLHD.width,
            height: FULLHD.height,
          }
        }
      },
      {
        name: 'secondary',
        containerCallback: (screen, screenFrame) => {
          return {
            handler: VerticalContainer,
            x: screenFrame.x + screenFrame.width / 2 - FULLHD.width / 2,
            y: screenFrame.y + FULLHD.height,
            width: FULLHD.width,
            height: screenFrame.height - FULLHD.height,
          }
        }
      },
      {
        name: 'left',
        affinity: [
          ['Slack', '.*'],
          ['Spark', '.*'],
          ['Vivaldi', 'WhatsApp'],
          ['Microsoft Teams', '.*'],
        ],
        containerCallback: (screen, screenFrame) => {
          return {
            handler: VerticalContainer,
            x: screenFrame.x,
            y: screenFrame.y,
            width: screenFrame.width / 2 - FULLHD.width / 2,
            height: screenFrame.height,
          }
        }
      },
      {
        name: 'right',
        affinity: [
          ['Notes', '.*'],
          ['Preview', '.*'],
        ],
        containerCallback: (screen, screenFrame) => {
          return {
            handler: VerticalContainer,
            x: screenFrame.x + screenFrame.width / 2 + FULLHD.width / 2,
            y: screenFrame.y,
            width: screenFrame.width / 2 - FULLHD.width / 2,
            height: screenFrame.height,
          }
        }
      },
    ]);
  }
}

function setupTwoScreen() {
  if (!!SpaceManager.active())
    return;
  let recordingScreen = Screen.all()[0];
  let controlScreen = Screen.all()[1];
  if (recordingScreen.frame().width != FULLHD.width && recordingScreen.frame().width != FULLHD.height) {
    controlScreen = Screen.all()[0];
    recordingScreen = Screen.all()[1];
  }
  for (const i in recordingScreen.spaces()) {
    const space = recordingScreen.spaces()[i];
    SpaceManager.add(recordingScreen, space, [
      {
        name: 'main',
        containerCallback: (screen, screenFrame) => {
          return {
            handler: SingleFramedContainer,
            x: screenFrame.x,
            y: screenFrame.y,
            width: screenFrame.width,
            height: screenFrame.height,
          }
        }
      }
    ]);
  }
  for (const i in controlScreen.spaces()) {
    const space = controlScreen.spaces()[i];
    SpaceManager.add(controlScreen, space, [
      {
        name: 'left',
        containerCallback: (screen, screenFrame) => {
          return {
            handler: VerticalContainer,
            x: screenFrame.x,
            y: screenFrame.y,
            width: screenFrame.width / 2,
            height: screenFrame.height,
          }
        }
      },
      {
        name: 'right',
        containerCallback: (screen, screenFrame) => {
          return {
            handler: VerticalContainer,
            x: screenFrame.x + screenFrame.width / 2,
            y: screenFrame.y,
            width: screenFrame.width / 2,
            height: screenFrame.height,
          }
        }
      }
    ]);
  }
}

function setup() {
  const screenCount = Screen.all().length;
  if (screenCount === 1) {
    log('setting up one screen layout');
    setupOneScreen();
  } else if (screenCount === 2) {
    log('setting up two screen layout');
    setupTwoScreen();
  }
}

// Keybindings
const mash = ['ctrl', 'cmd'];

// Move windows
Key.on('up', mash, () => SpaceManager.active().containerManager.swapFocused('main', true))
Key.on('down', mash, () => SpaceManager.active().containerManager.swapFocused('secondary', true))
Key.on('right', mash, () => SpaceManager.active().containerManager.swapFocused('right', true))
Key.on('left', mash, () => SpaceManager.active().containerManager.swapFocused('left', true))

// Focus windows
Key.on('h', mash, () => Window.focused().focusClosestNeighbour('west'));
Key.on('j', mash, () => Window.focused().focusClosestNeighbour('south'));
Key.on('k', mash, () => Window.focused().focusClosestNeighbour('north'));
Key.on('l', mash, () => Window.focused().focusClosestNeighbour('east'));

// Debug
Key.on('d', mash, () => SpaceManager.debug());
// Phoenix keys
// mash + r => reload
// Key.on('r', mash, () => Phoenix.reload())

// Event.on('screensDidChange', () => Phoenix.reload());

// Event.on('appDidLaunch', (app) => {
//   log(`appDidLaunch: ${app.name()}`)
// })

// Event.on('appDidActivate', (app) => {
//   log(`appDidActivate: ${app.name()}`)
// })

setup();
log('Configuration loaded.');

