import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { AppService } from './app.service';
import { chromium } from 'playwright-chromium';
import { createReadStream, readFile, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import PDFMerger from 'pdf-merger-js';
import { PDFDocument } from 'pdf-lib';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('pdf')
  async index(
    @Query('course') course,
    @Query('cookie') cookie,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieString = decodeURIComponent(cookie);
    const browser = await chromium.launch({
      headless: false,
      proxy: {
        server: 'http://127.0.0.1:7890',
      },
    });

    console.log('请求课程: ', course);
    const context = await browser.newContext();

    const cookieArr = cookieString.split(';').map((item) => {
      const [name, value] = item.split('=');
      console.log(name);
      return {
        name: name.trim(),
        value,
        url: 'https://juejin.cn',
      };
    });

    // await context.addCookies(cookieArr);

    const page = await context.newPage();

    await page.goto(`https://juejin.cn/book/${course}`);

    await page.waitForTimeout(20000);

    const element = await page.locator('.book-directory');
    console.log(111, await element.innerHTML());
    const items = await Promise.all(
      (await element.locator('a').all()).map((x) => x.getAttribute('href')),
    );

    console.log('获取课程章节数量: ', items.length);
    const pdfs: Buffer[] = [];
    console.log(items.slice(-1));
    await items.reduce((task, item, index) => {
      return task.then(async () => {
        const page = await context.newPage();
        await page.goto(`https://juejin.cn${item}`);
        console.log(await context.cookies());
        const [id] = item.split('/').reverse();
        console.log(`开始请求课程章节${index} /${items.length}:`, id);
        page.addStyleTag({
          content: `
          .book-summary{display:none!important;}
          .book-content{margin-left:0!important;}
          .book-content__header{display:none!important;}
          .book-body{padding-top:0!important;}
          .section-page{box-shadow:unset!important;}
          .book-comments{display:none!important;}
          .book-direction{display:none!important;}
          `,
        });

        await page.waitForTimeout(3000);

        const path = `public/pdfs/${course}/${id}.pdf`;
        const pdf = await page.pdf({
          margin: {
            top: '50px',
            right: '50px',
            bottom: '50px',
            left: '50px',
          },
          printBackground: false,
          format: 'A4',
          headerTemplate: '<h1>Header</h1>',
          footerTemplate: '<h1>Footer</h1>',
          displayHeaderFooter: false,
          // path,
        });

        pdfs.push(pdf);
        console.log('课程章节下载完成:', path);
        await page.close();
      });
    }, Promise.resolve());

    // const pdfs = await Promise.all(
    //   items.map(async (item) => {
    //     const [id] = item.split('/').reverse();
    //     const page = await browser.newPage();
    //     await page.goto(`https://juejin.cn${item}`);

    //     page.addStyleTag({
    //       content: `
    //       .book-summary{display:none!important;}
    //       .book-content{margin-left:0!important;}
    //       .book-content__header{display:none!important;}
    //       .book-body{padding-top:0!important;}
    //       .section-page{box-shadow:unset!important;}
    //       .book-comments{display:none!important;}
    //       .book-direction{display:none!important;}
    //       `,
    //     });

    //     const path = `public/pdfs/${course}/${id}.pdf`;
    //     await page.pdf({
    //       margin: {
    //         top: '50px',
    //         right: '50px',
    //         bottom: '50px',
    //         left: '50px',
    //       },
    //       printBackground: false,
    //       format: 'A4',
    //       headerTemplate: '<h1>Header</h1>',
    //       footerTemplate: '<h1>Footer</h1>',
    //       displayHeaderFooter: false,
    //       path,
    //     });
    //     await page.close();
    //     return path;
    //   }),
    // );
    // console.log(pdfs, 'pdfs');
    // const merger = new PDFMerger();
    // console.log(merger);

    // pdfs.forEach(async (pdf) => {
    //   await merger.add(pdf);
    // });

    // console.log('开始合并课程:');
    // await merger.save(`public/pdfs/${course}/index.pdf`); //save under given name and reset the internal document

    const pdfDoc = await PDFDocument.create();

    await pdfs.reduce((task, item) => {
      return task.then(async () => {
        const PDFItem = await PDFDocument.load(item);
        for (let j = 0; j < PDFItem.getPageCount(); j++) {
          const [PDFPageItem] = await pdfDoc.copyPages(PDFItem, [j]);
          pdfDoc.addPage(PDFPageItem);
        }
      });
    }, Promise.resolve());

    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="test.pdf"',
    });

    const pdfBytes = await pdfDoc.save();
    console.log('课程合并完成');
    // // await browser.close();
    // const file = createReadStream(
    //   join(process.cwd(), `public/pdfs/${course}/index.pdf`),
    // );

    return new StreamableFile(pdfBytes);
  }
}
