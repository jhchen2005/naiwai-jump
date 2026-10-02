// Keep existing bookmarks working while using one authoritative homepage.
// Resolve relative to this module so subdirectory deployments work too.
const home = new URL('../index.html', import.meta.url);
home.search = location.search;
home.hash = location.hash;
location.replace(home.href);
