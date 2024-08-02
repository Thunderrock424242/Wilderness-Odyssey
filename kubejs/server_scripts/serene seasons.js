// priority: 0

// Visit the wiki for more info - https://kubejs.com/

console.info('Hello, World! (Loaded server scripts)')

ServerEvents.loaded(e => {
    if (e.server.persistentData.firstLoad) return
    e.server.persistentData.firstLoad = true
    e.server.runCommandSilent('season set EARLY_SPRING')
  })