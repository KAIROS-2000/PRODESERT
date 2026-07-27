import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateProductContentDto } from './admin.dto';

describe('admin content DTO', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

  it('rejects 1C-owned product fields at the API boundary', async () => {
    await expect(
      pipe.transform(
        { expectedContentVersion: 1, description: 'Текст сайта', baseName: 'Попытка изменить 1С' },
        { type: 'body', metatype: UpdateProductContentDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only website-owned content fields', async () => {
    const result = await pipe.transform(
      {
        expectedContentVersion: 2,
        description: 'Текст сайта',
        seoTitle: 'SEO title',
        isHit: true,
      },
      { type: 'body', metatype: UpdateProductContentDto },
    );
    expect(result).toMatchObject({
      expectedContentVersion: 2,
      description: 'Текст сайта',
      seoTitle: 'SEO title',
      isHit: true,
    });
  });
});
