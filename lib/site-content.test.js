import React from 'react';
import { act, create } from 'react-test-renderer';
import SiteContent from '@/components/admin/SiteContent';
import { saveSiteContent, subscribeSiteContent } from './site-content';

jest.mock('./site-content', () => ({ saveSiteContent: jest.fn(), subscribeSiteContent: jest.fn() }));
const memoryStorage = () => { const data = {}; return { getItem: (k) => data[k] || null, setItem: (k,v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } }; };
let emit, view, handlers;
const field = () => view.root.findByProps({ id: 'content-hero-title' });
const button = (text) => view.root.findAllByType('button').find((b) => b.children.includes(text));
beforeEach(() => {
  handlers = {};
  global.sessionStorage = memoryStorage();
  global.window = { addEventListener: (k, fn) => { handlers[k] = fn; }, removeEventListener: (k) => { delete handlers[k]; }, confirm: jest.fn(() => true) };
  saveSiteContent.mockReset();
  subscribeSiteContent.mockImplementation((cb) => { emit = cb; cb({ hero: { title: 'Published' } }); return () => {}; });
  act(() => { view = create(<SiteContent />); });
});
afterEach(() => { act(() => view.unmount()); delete global.window; delete global.sessionStorage; });
test('typing does not write; Save waits for acknowledgement, disables editing, and reports success', async () => {
  let resolve;
  saveSiteContent.mockReturnValue(new Promise((r) => { resolve = r; }));
  act(() => field().props.onChange({ target: { value: 'Draft' } }));
  expect(saveSiteContent).not.toHaveBeenCalled();
  act(() => button('Save changes').props.onClick());
  expect(field().props.disabled).toBe(true);
  expect(saveSiteContent).toHaveBeenCalledWith({ hero: { title: 'Draft' } });
  await act(async () => resolve());
  expect(JSON.stringify(view.toJSON())).toContain('Saved. Storefront refresh requested.');
  expect(button('Save changes').props.disabled).toBe(true);
});
test('a rejected write keeps the editable draft for retry', async () => {
  saveSiteContent.mockRejectedValueOnce(new Error('permission-denied')).mockResolvedValueOnce();
  act(() => field().props.onChange({ target: { value: 'Retry me' } }));
  await act(async () => button('Save changes').props.onClick());
  expect(view.root.findByProps({ role: 'alert' }).children.join('')).toContain('Save failed');
  expect(field().props.value).toBe('Retry me');
  expect(button('Save changes').props.disabled).toBe(false);
  await act(async () => button('Save changes').props.onClick());
  expect(saveSiteContent).toHaveBeenCalledTimes(2);
});
test('incoming snapshots preserve edited fields and merge untouched remote changes on save', async () => {
  act(() => field().props.onChange({ target: { value: 'Draft' } }));
  act(() => emit({ hero: { title: 'Remote', subtitle: 'Another editor' } }));
  expect(field().props.value).toBe('Draft');
  saveSiteContent.mockResolvedValue();
  await act(async () => button('Save changes').props.onClick());
  expect(saveSiteContent).toHaveBeenCalledWith({ hero: { title: 'Draft', subtitle: 'Another editor' } });
});
test('interruption warns and draft survives unmount/remount until explicitly discarded', () => {
  act(() => field().props.onChange({ target: { value: 'Recover me' } }));
  const event = { preventDefault: jest.fn() };
  handlers.beforeunload(event);
  expect(event.preventDefault).toHaveBeenCalled();
  act(() => view.unmount());
  act(() => { view = create(<SiteContent />); });
  expect(field().props.value).toBe('Recover me');
  act(() => button('Discard draft').props.onClick());
  expect(field().props.value).toBe('Published');
  expect(saveSiteContent).not.toHaveBeenCalled();
});
test('reset is a draft change and saves removal of the override', async () => {
  act(() => button('reset').props.onClick());
  expect(saveSiteContent).not.toHaveBeenCalled();
  expect(field().props.value).toBe('');
  saveSiteContent.mockResolvedValue();
  await act(async () => button('Save changes').props.onClick());
  expect(saveSiteContent).toHaveBeenCalledWith({ hero: {} });
});
