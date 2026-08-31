import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { Injectable } from "@nestjs/common";
import { AppError } from "./errors.js";

@Injectable()
export class EmailDeliveryService {
  async sendOtp(input: { email: string; code: string; hotelDisplayName: string }): Promise<void> {
    if (process.env.ALLOW_TEST_OTP === "true") return;
    const from = process.env.SES_FROM_EMAIL;
    if (!from) throw new AppError("INTERNAL_ERROR", 500, false, { configuration: "SES_FROM_EMAIL" });
    const client = new SESv2Client({ region: process.env.AWS_REGION ?? "ap-southeast-1" });
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [input.email] },
        Content: {
          Simple: {
            Subject: { Data: `${input.hotelDisplayName} sign-in code`, Charset: "UTF-8" },
            Body: {
              Text: {
                Data: `Your six-digit code is ${input.code}. It expires shortly. If you did not request it, you may ignore this message.`,
                Charset: "UTF-8",
              },
            },
          },
        },
      }),
    );
  }
}
