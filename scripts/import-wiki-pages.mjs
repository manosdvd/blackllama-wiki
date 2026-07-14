import { main as seedHandbook } from './seed-handbook.mjs';

const args = process.argv.slice(2);
const retiredArguments = args.filter((argument) => (
  argument === '--public'
  || argument === '--archive-existing-handbook'
  || argument.toLowerCase().endsWith('.json')
));

async function main() {
  if (retiredArguments.length > 0) {
    throw new Error(
      `The JSON wiki importer and its arguments have been retired (${retiredArguments.join(', ')}). `
      + 'Use staffHandbookWiki.md with npm run seed:handbook instead.',
    );
  }

  console.warn(
    'scripts/import-wiki-pages.mjs is deprecated; forwarding to scripts/seed-handbook.mjs. '
    + 'The staffHandbookWiki.md import preserves Songbook documents.',
  );
  await seedHandbook(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
