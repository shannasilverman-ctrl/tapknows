import { useEffect, useState } from "react";
import { CardFace } from "@/components/card-face";
import { Sheet } from "@/components/sheet";
import { ArrowLeft, MoreHorizontal, Trash2 } from "lucide-react";

type Props = {
  issuer: string;
  name: string;
  winner?: boolean;
  onBack: () => void;
  onRemove?: () => void;
  onRename?: (nickname: string) => void;
  nickname?: string | null;
  children: React.ReactNode;
};

/**
 * Wallet-style pinned card: the card face sticks to the top of the screen
 * while the detail (earn rates, offers, caps, bonus progress) scrolls
 * beneath it. Small circled ellipsis opens a settings sheet.
 */
export function PinnedCardDetail({
  issuer,
  name,
  winner,
  onBack,
  onRemove,
  onRename,
  nickname,
  children,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftNickname, setDraftNickname] = useState(nickname ?? "");

  useEffect(() => setDraftNickname(nickname ?? ""), [nickname]);

  return (
    <div className="cs-app-body tap-card-detail-v2 min-h-screen text-foreground">
      <div className="tap-card-detail-v2-shell">
        {/* Pinned header + card */}
        <div className="cs-pinned-card tap-card-detail-v2-identity px-5">
          <div className="flex items-center justify-between h-11">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-[15px] text-primary hover:opacity-80 transition-opacity min-h-11 min-w-11 -ml-2 pl-2 pr-1"
              aria-label="Back to wallet"
            >
              <ArrowLeft className="size-5" />
              Wallet
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center rounded-full bg-white border border-border h-11 w-11 hover:border-border-strong transition-colors"
              aria-label="Card settings"
            >
              <MoreHorizontal className="size-5 text-foreground" />
            </button>
          </div>

          <div className="mt-2 max-w-md mx-auto">
            <div className="relative">
              <div className="cs-result-in">
                <CardFace
                  issuer={issuer}
                  name={nickname || name}
                  variant={winner ? "winner" : "default"}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Scrolling detail */}
        <div className="tap-card-detail-v2-content px-5 pb-16">{children}</div>
      </div>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Card settings">
        <div className="space-y-4">
          <div className="rounded-2xl bg-secondary/60 px-4 py-3">
            <label htmlFor="nickname" className="text-[12px] text-muted-foreground">
              Nickname
            </label>
            <input
              id="nickname"
              value={draftNickname}
              onChange={(e) => setDraftNickname(e.target.value)}
              placeholder={name}
              className="mt-1 w-full bg-transparent text-[17px] text-foreground focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onRename?.(draftNickname.trim());
              setSettingsOpen(false);
            }}
            className="w-full cs-btn-primary h-12"
          >
            Save
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={() => {
                onRemove();
                setSettingsOpen(false);
              }}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-destructive/10 text-destructive font-medium hover:bg-destructive/15 transition-colors"
            >
              <Trash2 className="size-4" />
              Remove card
            </button>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
