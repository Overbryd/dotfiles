module.exports = {
  defaultBrowser: {
    name: 'SafeBrowser',
    appType: 'command',
    command: '/Users/partenkirchen/.bin/safebrowser',
  },
  handlers: [
    {
      match: finicky.matchHostnames([
        // Google
        /.*\.?google\.com$/,
        /.*\.?google$/,
        // Gitlab
        /.*\.?gitlab\.com$/,
        // Github
        /.*\.?github\.com$/,
        // draw.io
        'app.diagrams.net',
        // Excalidraw
        'excalidraw.com',
        // OpenAI
        'chatgpt.com',
        /.*\.?openai\.com$/,
        // Slite
        /.*\.?slite\.com$/,
        // Fyrst
        /.*\.?fyrst\.de$/,
      ]),
      browser: 'Safari',
    },
    //{
    //  match: 'googlemail.com',
    //  browser: {
    //    name: 'SafeBrowser',
    //    appType: 'command',
    //    command: '/Users/partenkirchen/.bin/safebrowser',
    //  },
    //},
  ],
};

