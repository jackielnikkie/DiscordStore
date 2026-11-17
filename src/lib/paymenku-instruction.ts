import type { PaymenkuPaymentInfo } from "./paymenku";

export type PaymentInstructionKind = "qris" | "va" | "ewallet" | "cstore" | "unknown";

export type PaymentInstruction = {
  kind: PaymentInstructionKind;
  qrUrl?: string;
  qrString?: string;
  vaNumber?: string;
  bank?: string;
  paymentCode?: string;
  store?: string;
  checkoutUrl?: string;
  simulatorUrl?: string;
  expiresAt?: string;
};

export function parsePaymentInstruction(
  info?: PaymenkuPaymentInfo | null,
): PaymentInstruction {
  if (!info) {
    return { kind: "unknown" };
  }

  const base = {
    qrUrl: info.qr_url,
    qrString: info.qr_string,
    vaNumber: info.va_number,
    bank: info.bank,
    paymentCode: info.payment_code,
    store: info.store,
    checkoutUrl: info.checkout_url || info.checkout_url_app,
    simulatorUrl: info.simulator_url,
    expiresAt: info.expiration_date,
  };

  if (info.va_number) {
    return { ...base, kind: "va" };
  }

  if (info.payment_code) {
    return { ...base, kind: "cstore" };
  }

  if (base.checkoutUrl) {
    return { ...base, kind: "ewallet" };
  }

  if (info.qr_url || info.qr_string) {
    return { ...base, kind: "qris" };
  }

  return { ...base, kind: "unknown" };
}

/** Order menyimpan respons create apa adanya di paymenkuRawJson. */
export function readPaymentInstruction(rawJson?: string | null): PaymentInstruction {
  if (!rawJson) {
    return { kind: "unknown" };
  }

  try {
    const parsed = JSON.parse(rawJson);
    const info =
      parsed?.data?.payment_info ??
      parsed?.payment_info ??
      parsed?.data?.paymentInfo ??
      null;

    return parsePaymentInstruction(info);
  } catch {
    return { kind: "unknown" };
  }
}

export function buildInstructionLines(instruction: PaymentInstruction) {
  const lines: string[] = [];

  if (instruction.kind === "va" && instruction.vaNumber) {
    lines.push(`Transfer ${instruction.bank || "Virtual Account"}`);
    lines.push(`Nomor VA: ${instruction.vaNumber}`);
  }

  if (instruction.kind === "cstore" && instruction.paymentCode) {
    lines.push(`Bayar di ${instruction.store || "gerai ritel"}`);
    lines.push(`Kode bayar: ${instruction.paymentCode}`);
  }

  if (instruction.kind === "ewallet" && instruction.checkoutUrl) {
    lines.push(`Buka halaman pembayaran: ${instruction.checkoutUrl}`);
  }

  if (instruction.kind === "qris") {
    if (instruction.qrUrl) {
      lines.push(`QRIS: ${instruction.qrUrl}`);
    }

    if (instruction.qrString) {
      lines.push(`QR string: ${instruction.qrString}`);
    }
  }

  if (instruction.simulatorUrl) {
    lines.push(`Simulator sandbox: ${instruction.simulatorUrl}`);
  }

  return lines;
}
