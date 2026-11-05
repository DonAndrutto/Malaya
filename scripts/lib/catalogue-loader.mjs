// Allow maintenance scripts to use the same ES modules as Next (Node 24).
// Hooks are scoped to the project's lib directory, never to dependencies.
import { registerHooks } from 'node:module';
const libRoot = new URL('../../lib/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && context.parentURL?.startsWith(libRoot)
          && specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
        return next(specifier + '.js', context);
      }
      throw error;
    }
  },
  load(url, context, next) {
    return next(url, url.startsWith(libRoot) && url.endsWith('.json')
      ? { ...context, importAttributes: { type: 'json' } } : context);
  },
});
