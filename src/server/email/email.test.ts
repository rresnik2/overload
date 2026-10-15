import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOutbox, extractLinks, pushToOutbox, readOutbox } from "./outbox";
import { emailTransportFor, isReservedTestAddress, sendEmail } from "./send";
import { escapeHtml, passwordResetEmail, verificationEmail } from "./templates";

beforeEach(() => clearOutbox());
afterEach(() => vi.unstubAllEnvs());

describe("templates", () => {
  const url = "http://localhost:3001/api/auth/verify-email?token=abc&callbackURL=%2Fcontinue";

  it("verification email carries the link in both bodies", () => {
    const mail = verificationEmail({ name: "Ada", url });
    expect(mail.subject).toMatch(/confirm/i);
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(escapeHtml(url));
    expect(mail.text).toContain("Hi Ada,");
  });

  it("reset email carries the link and says it expires", () => {
    const mail = passwordResetEmail({ name: "Ada", url: "http://x.test/reset?token=1" });
    expect(mail.subject).toMatch(/reset/i);
    expect(mail.text).toContain("http://x.test/reset?token=1");
    expect(mail.text).toMatch(/expires in one hour/);
  });

  it("escapes user-controlled names in HTML", () => {
    const mail = verificationEmail({ name: `<script>alert("x")</script>`, url });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("outbox", () => {
  const message = (to: string, text = "no link") => ({ to, subject: "s", html: "<p/>", text });

  it("filters by recipient case-insensitively, newest first", () => {
    pushToOutbox(message("a@example.test", "first"));
    pushToOutbox(message("b@example.test"));
    pushToOutbox(message("A@example.test", "second"));
    expect(readOutbox("a@EXAMPLE.test").map((m) => m.text)).toEqual(["second", "first"]);
    expect(readOutbox()).toHaveLength(3);
  });

  it("extracts every http(s) link from the text body", () => {
    expect(extractLinks("go http://a.test/x?y=1&z=2 or https://b.test/p now")).toEqual(["http://a.test/x?y=1&z=2", "https://b.test/p"]);
  });

  it("keeps at most 200 messages", () => {
    for (let i = 0; i < 230; i++) pushToOutbox(message(`u${i}@example.test`));
    expect(readOutbox()).toHaveLength(200);
  });
});

describe("transport selection", () => {
  it("never sends to reserved test domains", () => {
    for (const address of ["a@example.test", "a@foo.invalid", "a@example.com", "a@mail.example.org", "a@localhost"]) {
      expect(isReservedTestAddress(address)).toBe(true);
      expect(emailTransportFor(address, "re_live_key")).toBe("outbox");
    }
    expect(isReservedTestAddress("a@gmail.com")).toBe(false);
  });

  it("uses the outbox without an API key, treating an empty key as unset", () => {
    expect(emailTransportFor("a@gmail.com", undefined)).toBe("outbox");
    expect(emailTransportFor("a@gmail.com", "")).toBe("outbox");
    expect(emailTransportFor("a@gmail.com", "   ")).toBe("outbox");
    expect(emailTransportFor("a@gmail.com", "re_key")).toBe("resend");
  });

  it("sendEmail stores in the outbox when there is no key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendEmail({ to: "real@gmail.com", subject: "Hi", html: "<p>x</p>", text: "see http://l.test/a" });
    expect(result.transport).toBe("outbox");
    expect(readOutbox("real@gmail.com")[0]?.links).toEqual(["http://l.test/a"]);
    info.mockRestore();
  });

  it("sendEmail keeps a reserved address in the outbox even with a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_would_be_live");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendEmail({ to: "t@example.test", subject: "Hi", html: "<p>x</p>", text: "x" });
    expect(result.transport).toBe("outbox");
  });
});
