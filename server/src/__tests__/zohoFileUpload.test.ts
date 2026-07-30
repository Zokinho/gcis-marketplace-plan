import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');
vi.mock('../services/zohoAuth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-token'),
  zohoRequest: vi.fn(),
  ZOHO_API_URL: 'https://www.zohoapis.ca/crm/v7',
}));

import { uploadProductFiles } from '../services/zohoApi';

const mockedAxios = vi.mocked(axios, true);

/** Zoho's success envelope — HTTP 200 with per-record status. */
const zohoSuccess = (fileId = 'file-abc') => ({
  data: { data: [{ code: 'SUCCESS', status: 'success', details: { id: fileId } }] },
});

/** Zoho's failure envelope — also HTTP 200, error only visible in the body. */
const zohoError = (code = 'INVALID_DATA', message = 'invalid field') => ({
  data: { data: [{ code, status: 'error', message, details: { api_name: 'CoAs_3' } }] },
});

const pdf = (name = 'report.pdf', size = 1024) => ({
  buffer: Buffer.alloc(size, 1),
  originalname: name,
  mimetype: 'application/pdf',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadProductFiles — ZFS upload', () => {
  it('uploads a CoA and attaches it via the v2 API', async () => {
    mockedAxios.post.mockResolvedValue(zohoSuccess('zfs-1'));
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await uploadProductFiles('prod-1', [], [pdf()]);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toContain('/files');

    // Attach must go through v2 — v7 silently ignores file_id on fileupload fields
    const [putUrl, putBody] = mockedAxios.put.mock.calls[0];
    expect(putUrl).toBe('https://www.zohoapis.ca/crm/v2/Products/prod-1');
    expect(putBody).toEqual({
      data: [{ CoAs: [{ file_id: 'zfs-1' }] }],
      trigger: [],
    });
  });

  it('sets a known Content-Length instead of chunked encoding', async () => {
    mockedAxios.post.mockResolvedValue(zohoSuccess());
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await uploadProductFiles('prod-1', [], [pdf('report.pdf', 4096)]);

    // form-data can only compute a length when the buffer is appended directly;
    // wrapping it in a Readable forces Transfer-Encoding: chunked.
    const form = mockedAxios.post.mock.calls[0][1] as any;
    expect(form.getLengthSync()).toBeGreaterThan(4096);
    expect(form.hasKnownLength()).toBe(true);
  });

  it('caps request body size with maxBodyLength, not maxContentLength', async () => {
    mockedAxios.post.mockResolvedValue(zohoSuccess());
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await uploadProductFiles('prod-1', [], [pdf()]);

    const config = mockedAxios.post.mock.calls[0][2] as any;
    expect(config.maxBodyLength).toBe(20 * 1024 * 1024);
    expect(config.maxContentLength).toBeUndefined();
  });

  it('rejects a file over the size limit without calling Zoho', async () => {
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await expect(
      uploadProductFiles('prod-1', [], [pdf('huge.pdf', 21 * 1024 * 1024)]),
    ).rejects.toThrow(/exceeds/);

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });

  it('sanitizes path separators and quotes out of the filename', async () => {
    mockedAxios.post.mockResolvedValue(zohoSuccess());
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await uploadProductFiles('prod-1', [], [pdf('OG/Kush "Batch"\r\n.pdf')]);

    const form = mockedAxios.post.mock.calls[0][1] as any;
    const body = form.getBuffer().toString();
    expect(body).toContain('filename="OG_Kush Batch.pdf"');
    expect(body).not.toContain('OG/Kush');
  });
});

describe('uploadProductFiles — error-inside-200 handling', () => {
  it('throws when the v2 attach is rejected in the response body', async () => {
    mockedAxios.post.mockResolvedValue(zohoSuccess('zfs-1'));
    mockedAxios.put.mockResolvedValue(zohoError('INVALID_DATA', 'invalid field'));

    // Zoho answered HTTP 200 — without inspecting data[0].status this looked
    // like a successful upload.
    await expect(uploadProductFiles('prod-1', [], [pdf()])).rejects.toThrow(
      /INVALID_DATA.*invalid field/,
    );
  });

  it('throws when the ZFS upload is rejected in the response body', async () => {
    mockedAxios.post.mockResolvedValue(zohoError('LIMIT_EXCEEDED', 'storage full'));
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await expect(uploadProductFiles('prod-1', [], [pdf()])).rejects.toThrow(/LIMIT_EXCEEDED/);
    // Nothing to attach, so no record update should be attempted
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });

  it('throws when Zoho returns a 200 with no record in the body', async () => {
    mockedAxios.post.mockResolvedValue(zohoSuccess('zfs-1'));
    mockedAxios.put.mockResolvedValue({ data: {} });

    await expect(uploadProductFiles('prod-1', [], [pdf()])).rejects.toThrow(/no record/);
  });

  it('reports a per-file failure while still attaching the files that worked', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(zohoSuccess('zfs-1'))
      .mockRejectedValueOnce(new Error('network reset'));
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await expect(
      uploadProductFiles('prod-1', [], [pdf('a.pdf'), pdf('b.pdf')]),
    ).rejects.toThrow(/1 failure/);

    // The CoA that uploaded cleanly is still attached
    expect(mockedAxios.put.mock.calls[0][1]).toEqual({
      data: [{ CoAs: [{ file_id: 'zfs-1' }] }],
      trigger: [],
    });
  });

  it('resolves without error when everything succeeds', async () => {
    mockedAxios.post.mockResolvedValue(zohoSuccess('zfs-1'));
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await expect(
      uploadProductFiles('prod-1', [pdf('img.png')], [pdf('coa.pdf')]),
    ).resolves.toBeUndefined();

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.put.mock.calls[0][1]).toEqual({
      data: [{ Image_1: [{ file_id: 'zfs-1' }], CoAs: [{ file_id: 'zfs-1' }] }],
      trigger: [],
    });
  });
});

describe('uploadProductFiles — overflow attachments', () => {
  it('still uploads overflow files when the field attach fails', async () => {
    // 4 images fill Image_1..Image_4, the 5th overflows to record attachments
    const images = Array.from({ length: 5 }, (_, i) => pdf(`img-${i}.png`));

    mockedAxios.post.mockResolvedValue(zohoSuccess('zfs-1'));
    mockedAxios.put.mockResolvedValue(zohoError());

    await expect(uploadProductFiles('prod-1', images, [])).rejects.toThrow(/failure/);

    // 4 ZFS uploads + 1 overflow attachment — the attach failure must not
    // short-circuit the overflow work
    expect(mockedAxios.post).toHaveBeenCalledTimes(5);
    expect(mockedAxios.post.mock.calls[4][0]).toContain('/Products/prod-1/Attachments');
  });

  it('surfaces a rejected overflow attachment', async () => {
    const images = Array.from({ length: 5 }, (_, i) => pdf(`img-${i}.png`));

    mockedAxios.post
      .mockResolvedValueOnce(zohoSuccess('zfs-1'))
      .mockResolvedValueOnce(zohoSuccess('zfs-2'))
      .mockResolvedValueOnce(zohoSuccess('zfs-3'))
      .mockResolvedValueOnce(zohoSuccess('zfs-4'))
      .mockResolvedValueOnce(zohoError('INVALID_DATA', 'attachment rejected'));
    mockedAxios.put.mockResolvedValue(zohoSuccess());

    await expect(uploadProductFiles('prod-1', images, [])).rejects.toThrow(
      /attachment img-4\.png.*INVALID_DATA/,
    );
  });
});
