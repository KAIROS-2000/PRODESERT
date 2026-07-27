import { NotFoundException } from '@nestjs/common';
import { PublicContentService } from './public-content.service';

describe('public content service', () => {
  it('exposes only currently active banners', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new PublicContentService({ banner: { findMany } } as never);

    await expect(service.banners()).resolves.toEqual({ items: [] });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.any(Array) }),
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
      }),
    );
    const [{ where }] = findMany.mock.calls[0] as [{ where: { AND: readonly unknown[] } }];
    expect(JSON.stringify(where)).toContain('endsAt');
  });

  it('does not query the database for an invalid public page slug', async () => {
    const findFirst = jest.fn();
    const service = new PublicContentService({ contentPage: { findFirst } } as never);

    await expect(service.page('../private')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
