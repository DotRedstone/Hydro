// Design tokens must land before anything that consumes var(--c-*).
import './palettes/claude.css';
import './palettes/sepia.css';
import './palettes/nord.css';
import './palettes/solarized.css';
import './palettes/github.css';
import './palettes/rosepine.css';
import 'normalize.css/normalize.css';
import 'allotment/dist/style.css';
import 'katex/dist/katex.min.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import 'mantine-contextmenu/styles.css';
import '@fontsource/fira-code';
import '@fontsource/source-code-pro';
import '@fontsource/roboto-mono';
import '@fontsource/inconsolata';
import '@fontsource/ubuntu-mono';
import '@fontsource/pt-mono';
import '@fontsource/dm-mono';
import '@fontsource/jetbrains-mono';
// Serif display faces: Latin from Source Serif 4, CJK from Noto Serif SC.
// Both ship as unicode-range subsets, so a page only downloads what it shows.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/500.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/500.css';
import '@fontsource/noto-serif-sc/600.css';
import 'vj/misc/float.styl';
import 'vj/misc/typography.styl';
import 'vj/misc/textalign.styl';
import 'vj/misc/grid.styl';
import 'vj/misc/slideout.styl';
import 'vj/misc/.iconfont/webicon.styl';
import 'vj/misc/immersive.styl';
import 'vj/misc/structure.styl';
import 'vj/misc/section.styl';
import 'vj/misc/nothing.styl';
import 'vj/components/editor/cmeditor.styl';
import './bp6-compat.css';

// load all page stylesheets
const pageStyleReq = require.context('../', true, /\.page\.styl$/i);
pageStyleReq.keys().map((key) => pageStyleReq(key));
const pageStyleReqDefault = require.context('../', true, /\.page\.default\.styl$/i);
pageStyleReqDefault.keys().map((key) => pageStyleReqDefault(key));

// Load after page styles in source order; final extracted CSS ordering is determined by the bundler.
require('./claude-foundation.styl');
require('./claude-navigation.styl');
require('./claude-authoring.styl');
require('./claude-motion.styl');
