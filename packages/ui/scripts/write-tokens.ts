import { writeFileSync } from 'node:fs';
import { renderTokensCss } from '../src/tokens';

writeFileSync(new URL('../src/tokens.css', import.meta.url), renderTokensCss());
console.info('Wrote src/tokens.css');
