/* eslint-disable @typescript-eslint/no-var-requires */
import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
const FormData = require('form-data');
import fetch from 'node-fetch';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  findJournalType(str: string) {
    const journalMap = {
      JISSR: 'JISSR',
      IJPEE: 'IJPEE',
      IJOMSR: 'IJOMSR',
      JSSHL: 'JSSHL',
      WJIMT: 'WJIMT',
      jrve: 'bryanhousepub',
      jpce: 'bryanhousepub',
      jpme: 'bryanhousepub',
      jcmp: 'bryanhousepub',
      jrse: 'bryanhousepub',
      jerp: 'bryanhousepub',
      jmme: 'bryanhousepub',
      ijer: 'bryanhousepub',
      jgebf: 'bryanhousepub',
      ies: 'bryanhousepub',
      jssh: 'bryanhousepub',
      jah: 'bryanhousepub',
      JSSPP: 'JSSPP',
      JTIEM: 'JTIEM',
      JOSTR: 'JOSTR',
      JTPCE: 'JTPCE',
      JTPSS: 'JTPSS',
      JTPMS: 'JTPMS',
      JTPES: 'JTPES',
    };

    const keys = Object.keys(journalMap);

    const key = keys.find((key) => {
      return str.toLowerCase().includes(key.toLowerCase());
    });

    return key ? journalMap[key] : null;
  }

  sendEndMail(
    results: {
      fileName?: string;
      subject: string;
      msg?: string;
    }[],
  ) {
    if (results.length) {
      const sendType = results[0].msg ? 'fail' : 'success';
      let text = '';
      if (sendType === 'fail') {
        results.forEach((r) => (text += r.msg + '\n\r'));
      }
      const options = {
        from: this.configService.get('user'),
        to: this.configService.get('remindUser'),
        subject: sendType + '更新提醒',
        text,
      };
      this.appService.sendMail(options);
    }
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/test')
  @Cron('1 1 16 * * *')
  async runTask() {
    const mails = await this.appService.getFilterMails(
      this.configService.get('asyncDateNum'),
    );
    const successPublish = [];
    const errorPublish = [];
    for (const mail of mails) {
      if (!mail.subject || mail.subject.split('-').length < 2) {
        const msg = `邮件主题识别失败, 邮件主题: ${mail?.subject}, 如果不是更新 pdf 邮件请忽略`;
        errorPublish.push({
          subject: mail.subject,
          msg,
        });
        this.logger.warn(msg);
        continue;
      }

      // if ()
      if (mail?.attachments?.length) {
        for (let i = 0; i < mail?.attachments?.length; i++) {
          const source = mail.attachments[i];
          const info = {
            fileName: source.fileName,
            subject: mail.subject,
          };
          const journalType =
            this.findJournalType(mail.subject) ||
            this.findJournalType(source.fileName);
          if (!journalType) {
            const msg = `更新失败，无法定位 journal 类型, subject: ${mail.subject}, fileName: ${source.fileName}`;
            errorPublish.push({ ...info, msg });
            this.logger.warn(msg);
            continue;
          }
          const fd = new FormData();
          fd.append('file', source.content, {
            filename: source.fileName,
            contentType: source.contentType,
            knownLength: source.length,
          });
          fd.append('ts', Date.now());
          fd.append('journalType', journalType);
          fd.append('uploadType', 'pdf');
          const res = await fetch('http://66.42.109.174:4000/upload', {
            method: 'POST',
            body: fd as any,
          })
            .then((res) => res.json && res.json())
            .catch((e) => {
              const msg = `上传失败, subject: ${mail.subject}, fileName: ${source.fileName}`;
              errorPublish.push({ ...info, msg });
              this.logger.error(e);
              return {};
            });
          if (res.code === 1) {
            let msg = '',
              hasError;
            if (res.journals) {
              const journals = Buffer.from(res.journals, 'utf-8').toString();
              hasError =
                journals.includes('鈥檚') ||
                journals.includes('鈥') ||
                journals.includes('�');
            }

            if (hasError) {
              msg = `检测到乱码错误, subject: ${mail.subject}, fileName: ${source.fileName}`;
              this.logger.warn(msg);
              errorPublish.push({ ...info, msg });
            } else {
              successPublish.push({
                fileName: source.fileName,
                subject: mail.subject,
              });
            }
          }
        }
      }
    }

    console.log('successPublish', successPublish);
    console.log('errorPublish', errorPublish);
    this.sendEndMail(errorPublish);

    return 'success';
  }
}
