/* eslint-disable @typescript-eslint/no-var-requires */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const Imap = require('imap');
const MailParser = require('mailparser').MailParser;
const nodemailer = require('nodemailer');

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private filterFrom: string[] = [];
  private mailTransport: any;
  constructor(private readonly configService: ConfigService) {
    this.filterFrom = this.configService.get('filterFrom');
    this.mailTransport = nodemailer.createTransport({
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      auth: {
        user: this.configService.get('user'),
        pass: this.configService.get('code'),
      },
    });
  }
  getHello(): string {
    return 'Hello World!';
  }
  async getFilterMails(lastDays = 2) {
    if (typeof lastDays !== 'number') {
      throw 'option error, lastDays require number';
    }

    const d = new Date();
    d.setDate(d.getDate() - lastDays);
    const searchCriteria = [['SINCE', d.toLocaleString()]];
    try {
      let mails = await this.getImapMails(searchCriteria);
      mails = mails.filter((mail: any) =>
        this.filterFrom.includes(mail?.from?.[0]?.address),
      );
      return mails;
    } catch (e) {
      // todo: add mail send
      console.log(e);
      return [];
    }
  }

  async getImapMails(searchCriteria): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const mails = [];
      setTimeout(() => {
        reject('timeout');
      }, 1000 * 60 * 5);

      const imap = new Imap({
        user: this.configService.get('user'),
        password: this.configService.get('code'),
        host: 'imap.qq.com',
        port: 993,
        tls: true, // use secure connection
        tlsOptions: { rejectUnauthorized: false },
      });

      function openInbox(cb) {
        imap.openBox('INBOX', true, cb);
      }

      imap.once('ready', function () {
        openInbox(function (err, box) {
          if (err) reject(err);
          imap.search(searchCriteria, function (err, searchResults) {
            if (err) reject(err);

            if (!searchResults || searchResults.length === 0) {
              console.log('no new mail in inbox');
              resolve([]);
            }
            console.log('found %d new messages', searchResults.length);
            const fetch = imap.fetch(searchResults, {
              markSeen: false,
              bodies: '',
            });
            fetch.on('message', function (msg) {
              let uid, flags;
              msg.on('attributes', function (attrs) {
                uid = attrs.uid;
                flags = attrs.flags;
              });
              const mp = new MailParser();
              mp.once('end', function (mail) {
                mail.uid = uid;
                mail.flags = flags;
                mails.push(mail);
                console.log('get mail', mail.subject);
                if (mails.length === searchResults.length) {
                  resolve(mails);
                }
              });
              msg.once('body', function (stream, info) {
                stream.pipe(mp);
              });
            });
            fetch.once('end', function () {
              console.log('Done fetching all messages!');
              imap.end();
            });
            fetch.once('error', function (err) {
              reject(err);
            });
          });
        });
      });

      imap.once('error', function (err) {
        console.log(err);
      });

      imap.once('end', function () {
        console.log('Connection ended');
      });
      imap.connect();
    });
  }

  public sendMail(op) {
    this.logger.log('send mail start', op);
    this.mailTransport.sendMail(op, function (err, msg) {
      if (err) {
        console.log(err);
        console.log('sendMail fail');
      } else {
        console.log('sendMail success');
      }
    });
  }
}
