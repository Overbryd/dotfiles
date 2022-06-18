Phoenix.set({
  daemon: false,
  openAtLogin: true
});

const log = Phoenix.log;
const FULLHD = {
  width: 1920,
  height: 1080,
};

class WindowContainer {
  constructor() {
    this.stack = [];
    this.windowDidCloseHandler = new Event('windowDidClose', (window) => this.removeWindow(window))
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

  setupContainer(screen, name, containerCallback) {
    const screenFrame = screen.flippedVisibleFrame();
    const frame = containerCallback(screen, screenFrame);
    const container = new frame.handler(frame);
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

  swapFocused(name) {
    const window = Window.focused();
    const targetContainer = this.containers.get(name);
    if (!targetContainer)
      return;
    let current;
    for (const [name, container] of this.containers) {
      if (container.has(window))
        current = name;
        break;
    }
    if (current === name)
      return;
    const swapWindow = targetContainer.stackHead();
    this.unshiftWindow(window, name);
    if (swapWindow !== undefined && current)
      this.unshiftWindow(swapWindow, current);
  }

  render() {
    for (const [name, container] of this.containers) {
      container.render();
    }
  }

  adopt(space) {
    const containerNames = [...this.containers.keys()];
    const focusedHash = Window.focused().hash();
    let mainWindow;
    for (const i in space.windows()) {
      const window = space.windows()[i];
      const containerName = containerNames[i % containerNames.length];
      this.pushWindow(window, containerName, false);
      if (window.hash() === focusedHash) {
        mainWindow = window;
      }
    }
    if (mainWindow && containerNames.includes('main')) {
      this.pushWindow(mainWindow, 'main', false);
    }
    this.render();
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
    SpaceManager.spaceManagers.set(space.hash(), spaceManager);
  }

  constructor(screen, space, containers) {
    this.screen = screen;
    this.space = space;
    this.containerManager = new ContainerManager();
    this.setupContainers(containers);
  }

  setupContainers(containers) {
    for (const [_i, container] of containers.entries()) {
      const {name, containerCallback} = container;
      this.containerManager.setupContainer(this.screen, name, containerCallback);
    }
    this.containerManager.adopt(this.space);
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
Key.on('up', mash, () => SpaceManager.active().containerManager.swapFocused('main'))
Key.on('down', mash, () => SpaceManager.active().containerManager.swapFocused('secondary'))
Key.on('right', mash, () => SpaceManager.active().containerManager.swapFocused('right'))
Key.on('left', mash, () => SpaceManager.active().containerManager.swapFocused('left'))

// Focus windows
Key.on('h', mash, () => Window.focused().focusClosestNeighbour('west'));
Key.on('j', mash, () => Window.focused().focusClosestNeighbour('south'));
Key.on('k', mash, () => Window.focused().focusClosestNeighbour('north'));
Key.on('l', mash, () => Window.focused().focusClosestNeighbour('east'));

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

