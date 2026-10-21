module.exports = {
  defaultBrowser: {
    name: 'SafeBrowser',
    appType: 'command',
    command: '/Users/partenkirchen/.bin/safebrowser',
  },
  handlers: [
    {
      match: finicky.matchHostnames([
        // Atlassian authentication must stay on this machine for loopback callbacks
        'auth.atlassian.com',
        'id.atlassian.com',
        // Google
        /.*\.?google\.com$/,
        /.*\.?google$/,
        // AWS
        /^oidc\.*\.amazonaws\.com$/,
        /^d-[^.]+\.awsapps\.com$/,
        // Zscaler
        'samlsp.private.zscaler.com',
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

