import { Sheet } from "@/components/sheet";
import { AuthPanel } from "@/components/auth-panel";

type Props = { open: boolean; onClose: () => void };

/**
 * The conversion sheet. Opens from the "Save my wallet" pass on Home.
 * On successful sign-in, the root's useGuestMigration hook moves the
 * local wallet into the account and toasts "Wallet saved."
 */
export function SaveWalletSheet({ open, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Save your wallet">
      <p className="text-[13px] text-muted-foreground leading-relaxed -mt-1 mb-4">
        Keep your cards, priorities, and recovered balance across devices. One tap.
      </p>
      <AuthPanel compact onMagicSent={onClose} />
    </Sheet>
  );
}
