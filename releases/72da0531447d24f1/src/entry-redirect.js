// Keep existing bookmarks working while using one authoritative homepage.
// Resolve beside play.html even when this module lives in a versioned directory.
const home = new URL('./index.html', location.href);
home.search = location.search;
home.hash = location.hash;
location.replace(home.href);
