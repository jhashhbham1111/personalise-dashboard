import { env } from "./env";

/**
 * What this deployment can actually do, as opposed to what the code supports.
 *
 * Marketing copy reads from here rather than hard-coding promises. The problem
 * this solves is specific: the homepage claimed "Your own room with screen
 * share and recording, built in" and "Pay by UPI in a few taps" while
 * LIVE_PROVIDER was `mock` and ONLINE_PAYMENTS was `off` — so a student read a
 * promise, enrolled, and then found neither thing existed. Deriving the
 * sentence from the flag means the claim appears exactly when it becomes true,
 * and nobody has to remember to edit a page on the day the gateway goes live.
 */
export const capabilities = {
  /** Students can pay inside the app, rather than paying the instructor directly. */
  onlinePayments: env.onlinePayments && env.paymentProvider !== "mock",

  /**
   * There is a real media server behind the live room. With `mock` the room
   * shell renders and shows your own camera, which is enough to develop
   * against but not something to advertise.
   */
  liveVideo: env.liveProvider !== "mock",

  /** Booking confirmations and reminders reach an actual inbox. */
  email: env.notifyProvider !== "console",
} as const;

/**
 * How money changes hands, in the words a student needs to read before they
 * enrol. Both branches describe something that genuinely works today.
 */
export const paymentCopy = capabilities.onlinePayments
  ? {
      short: "Pay by UPI in a few taps.",
      instructor: "take UPI payments",
      feature: "Students pay the way they actually pay. Cash gets tracked too.",
    }
  : {
      short: "Pay your instructor directly — cash, UPI or bank transfer.",
      instructor: "record what each student has paid",
      feature:
        "Students pay you directly. Record it once and their pass activates.",
    };

/** The same, for the live-class promise. */
export const liveCopy = capabilities.liveVideo
  ? {
      join: "Join the live room from your dashboard, or get the venue address and directions.",
      instructor: "run the live session in-app",
      featureTitle: "Live classes in-app",
      featureBody: "Your own room with screen share and recording, built in.",
    }
  : {
      join: "Get the venue address and directions, or the joining link for online classes.",
      instructor: "keep every class, student and payment in one place",
      featureTitle: "Every class in one place",
      featureBody:
        "Rosters, attendance and recordings against each session, online or in the studio.",
    };
