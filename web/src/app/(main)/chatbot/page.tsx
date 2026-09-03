'use client';

import { useEffect, useRef, useState } from 'react';

import TopBar from '@/components/layout/TopBar';
import LineBotInviteDialog from '@/components/features/chatbot/LineBotInviteDialog';
import { Button } from '@/components/ui/button';
import Caption from '@/components/shared/Caption';
import { FormError } from '@/components/features/auth/form-error';
import { useLocale } from '@/components/i18n/LocaleContext';
import { ApiError } from '@/lib/api-client';
import {
  useChatMessages,
  useSendChatMessage,
  useShops,
} from '@/lib/hooks/use-inventory';
import { useSelectedShop } from '@/components/shared/SelectedShopContext';
import {
  useApplyChatCommand,
  useSelectChatCandidate,
  useSelectChatDestination,
  type DestinationShop,
  type StockCandidate,
} from '@/lib/hooks/use-chat';

const content = {
  th: {
    title: 'แชทบอทรับสต็อก',
    titleFor: (shop: string) => `แชทบอทของร้าน ${shop}`,
    inputPh: 'พิมพ์คำสั่ง เช่น "เพิ่มโค้ก 10" "ขายโค้ก 2" หรือ "ย้ายโค้ก 5 ไปร้าน สาขาสอง"',
    sendBtn: 'ส่ง →',
    sending: 'กำลังส่ง…',
    caption:
      'เพิ่ม ลด ขาย ย้ายของไปอีกร้าน และถามยอดคงเหลือได้ ใช้คำสั่งเดียวกันจากฝั่ง LINE ได้เลย ระบบจะให้ยืนยันก่อนบันทึกลงจริงทุกครั้ง',
    confirmBtn: 'ยืนยัน →',
    cancelBtn: 'ยกเลิก',
    working: 'กำลังบันทึก…',
    confirmed: '✅ บันทึกสต็อกแล้ว',
    cancelled: 'ยกเลิกรายการแล้ว',
    noShop: 'ยังไม่มีร้าน ต้องสร้างร้านก่อนถึงจะใช้แชทบอทได้',
    loading: 'กำลังโหลด…',
    empty:
      'ทักมาได้เลยครับ เช่น "เพิ่มโค้ก 10" หรือพิมพ์ "ช่วยเหลือ" เพื่อดูวิธีใช้',
    chooseLabel: 'เลือกสินค้าที่ต้องการ',
    chooseShopLabel: (current: string) =>
      `ตอนนี้อยู่ที่ร้าน ${current} — เลือกร้านปลายทางที่จะย้ายไป`,
    stockLeft: (qty: number, unit: string) => `เหลือ ${qty} ${unit}`,
  },
  en: {
    title: 'Stock Chatbot',
    titleFor: (shop: string) => `${shop} Chatbot`,
    inputPh: 'Type a command, e.g. "add 10 coke", "sell 2 coke" or "move 5 coke to Branch 2"',
    sendBtn: 'Send →',
    sending: 'Sending…',
    caption:
      "Add, remove, sell, move stock between shops, and check quantities. The same commands work from the shop's LINE account, and every change is confirmed before it is saved.",
    confirmBtn: 'Confirm →',
    cancelBtn: 'Cancel',
    working: 'Saving…',
    confirmed: '✅ Stock saved',
    cancelled: 'The pending item was cancelled',
    noShop: 'No shop yet. Create a shop before using the chatbot.',
    loading: 'Loading…',
    empty: 'Say hello, or try "add 10 coke". Type "help" to see what I can do.',
    chooseLabel: 'Choose the product you meant',
    chooseShopLabel: (current: string) =>
      `You are in ${current} — choose the shop to move stock to`,
    stockLeft: (qty: number, unit: string) => `${qty} ${unit} left`,
  },
};

export default function ChatbotPage() {
  const { locale } = useLocale();
  const t = content[locale];

  const [input, setInput] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<StockCandidate[]>([]);
  // [อั้ม] ร้านปลายทางที่เลือกได้ ของคำสั่งย้ายที่ยังไม่ได้ระบุปลายทาง
  const [destinationShops, setDestinationShops] = useState<DestinationShop[]>(
    [],
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const shopsQuery = useShops();
  const shops = shopsQuery.data ?? [];
  const { selectedShopId } = useSelectedShop();
  // เดิมล็อกไว้ที่ shops[0] ตายตัว — สลับร้านใน sidebar แล้วแชทยังคุยกับร้านแรก
  // อยู่ สั่งเพิ่ม/ลดสต็อกผ่านแชทจึงไปลงผิดร้านโดยไม่มีอะไรเตือน
  // ร้านที่เคยเลือกอาจถูกลบไปแล้ว — ตกกลับไปร้านแรกเหมือนที่ (main)/layout.tsx ทำ
  const shopId =
    selectedShopId && shops.some((shop) => shop.id === selectedShopId)
      ? selectedShopId
      : shops[0]?.id;
  /**
   * หัวข้อบอกชื่อร้านที่กำลังคุยอยู่ — แชทสั่งเพิ่ม/ลดสต็อกจริง การรู้ว่ากำลัง
   * คุยกับร้านไหนจึงสำคัญกว่าการรู้ว่าหน้านี้ชื่ออะไร
   *
   * ระหว่างที่รายชื่อร้านยังโหลดไม่เสร็จจะยังไม่มีชื่อ ต้องตกกลับไปหัวข้อเดิม
   * ไม่งั้นจะเห็น "แชทบอทของundefined" แวบหนึ่งทุกครั้งที่เข้าหน้า
   */
  const shopName = shops.find((shop) => shop.id === shopId)?.name;
  const title = shopName ? t.titleFor(shopName) : t.title;

  const chatQuery = useChatMessages(shopId);
  const sendMessage = useSendChatMessage(shopId);
  const applyCommand = useApplyChatCommand(shopId);
  const selectCandidate = useSelectChatCandidate(shopId);
  const selectDestination = useSelectChatDestination(shopId);

  const messages = chatQuery.data?.length
    ? [...chatQuery.data].reverse().map((message) => ({
        role: message.role === 'USER' ? ('user' as const) : ('bot' as const),
        content: message.content,
      }))
    : [];

  const toMessage = (error: unknown, fallback: string) =>
    error instanceof ApiError ? error.message : fallback;

  const onSend = () => {
    const message = input.trim();
    if (!message || sendMessage.isPending) return;

    setActionError(null);

    sendMessage.mutate(message, {
      onSuccess: (result) => {
        setInput('');
        // มี pendingAction = บอทตีความได้ กำลังรอให้กดยืนยัน
        // ฝั่ง LINE ใช้พิมพ์คำว่า "ยืนยัน" แทน เพราะกดปุ่มไม่ได้
        const payload = result as {
          pendingAction: { id: string; shopProductId: string | null } | null;
          candidates?: StockCandidate[];
          destinationShops?: DestinationShop[];
        };

        setPendingId(payload?.pendingAction?.id ?? null);
        // มี candidates = ชื่อกำกวม ต้องให้เลือกสินค้าก่อนถึงจะยืนยันได้
        setCandidates(payload?.candidates ?? []);
        setDestinationShops(payload?.destinationShops ?? []);
      },
      onError: (error) =>
        setActionError(toMessage(error, 'ส่งข้อความไม่สำเร็จ')),
    });
  };

  // บอทตอบกลับผ่านประวัติแชทอยู่แล้ว จึงไม่ต้องขึ้นแถบ notice ซ้ำอีก
  const onApply = (action: 'CONFIRM' | 'CANCEL') => {
    if (!pendingId) return;
    setActionError(null);

    applyCommand.mutate(
      { pendingId, action },
      {
        onSuccess: () => {
          setPendingId(null);
          setCandidates([]);
        },
        onError: (error) =>
          setActionError(
            toMessage(
              error,
              action === 'CONFIRM' ? 'ยืนยันไม่สำเร็จ' : 'ยกเลิกไม่สำเร็จ',
            ),
          ),
      },
    );
  };

  const onSelectDestination = (destinationShopId: string) => {
    if (!pendingId) return;
    setActionError(null);

    selectDestination.mutate(
      { pendingId, destinationShopId },
      {
        onSuccess: () => setDestinationShops([]),
        onError: (error) =>
          setActionError(toMessage(error, 'เลือกร้านปลายทางไม่สำเร็จ')),
      },
    );
  };

  const onSelectCandidate = (shopProductId: string) => {
    if (!pendingId) return;
    setActionError(null);

    selectCandidate.mutate(
      { pendingId, shopProductId },
      {
        // เลือกเสร็จแล้วรายการมี shopProductId ครบ กดยืนยันได้เลย
        onSuccess: (result) => {
          setCandidates([]);
          // ย้ายสินค้าอาจยังเหลือขั้นเลือกร้านปลายทางต่ออีกขั้น
          const payload = result as {
            destinationShops?: DestinationShop[];
          };
          setDestinationShops(payload?.destinationShops ?? []);
        },
        onError: (error) =>
          setActionError(toMessage(error, 'เลือกสินค้าไม่สำเร็จ')),
      },
    );
  };

  const isBusy =
    applyCommand.isPending ||
    selectCandidate.isPending ||
    selectDestination.isPending;

  // เลื่อนไปข้อความล่าสุดทุกครั้งที่บทสนทนายาวขึ้น ไม่งั้นผู้ใช้ต้องเลื่อนเอง
  // ทุกครั้งที่บอทตอบ ซึ่งขัดกับความคาดหวังของหน้าแชท
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pendingId, candidates.length]);

  return (
    <>
      <TopBar title={title} />

      {/*
        min-h-0 จำเป็นทั้งชั้นนี้และชั้นกล่องแชท — flex item มี min-height:auto
        เป็นค่าเริ่มต้น ถ้าไม่ทับค่านี้ กล่องแชทจะดันตัวเองสูงตามเนื้อหา
        แทนที่จะคงความสูงแล้วเลื่อนอยู่ข้างในตัวเอง
      */}
      <main className='flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4'>
        {/*
          วางไว้นอกกล่องแชท ไม่ใช่ในกล่อง — ในกล่องมันจะเลื่อนหายไปกับข้อความ
          พอแชทยาวขึ้น ซึ่งเป็นตอนที่คนน่าจะอยากย้ายไปคุยบน LINE พอดี
        */}
        <div className='flex justify-end'>
          <LineBotInviteDialog />
        </div>

        {/* กล่องแชทกินพื้นที่ที่เหลือทั้งหมด ทั้งกว้างและสูง */}
        <div
          ref={scrollRef}
          className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl bg-secondary p-4 sm:p-5'
        >
          {shopsQuery.isPending || chatQuery.isPending ? (
            <p className='text-sm text-muted-foreground'>{t.loading}</p>
          ) : !shopId ? (
            <p className='text-sm text-muted-foreground'>{t.noShop}</p>
          ) : messages.length === 0 ? (
            <p className='text-sm text-muted-foreground'>{t.empty}</p>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[min(78%,42rem)] px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'rounded-[17px_17px_5px_17px] bg-brand-dark text-background'
                      : 'rounded-[17px_17px_17px_5px] border border-border bg-background text-foreground'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>

        {/*
          ปุ่มอยู่นอกกล่องแชทที่เลื่อนได้ เพื่อให้กดได้เสมอโดยไม่ต้องเลื่อนหา
          โผล่เฉพาะตอนมีรายการรออยู่จริง — ตรงกับฝั่ง LINE ที่ต้องพิมพ์
          "ยืนยัน" ก่อนสต็อกถึงจะขยับ ไม่มีการบันทึกอัตโนมัติ
        */}
        {pendingId && candidates.length > 0 && (
          <div className='flex flex-col gap-2 rounded-2xl border border-border bg-background p-3'>
            <p className='text-xs font-semibold text-muted-foreground'>
              {t.chooseLabel}
            </p>
            <div className='flex flex-wrap gap-2'>
              {candidates.map((candidate) => (
                <Button
                  key={candidate.shopProductId}
                  variant='outline'
                  size='sm'
                  disabled={isBusy}
                  onClick={() => onSelectCandidate(candidate.shopProductId)}
                >
                  {candidate.name} ·{' '}
                  {t.stockLeft(candidate.stockQty, candidate.unit)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* [อั้ม] เลือกร้านปลายทางของคำสั่งย้าย — ขั้นถัดจากเลือกสินค้า */}
        {pendingId && destinationShops.length > 0 && (
          <div className='flex flex-col gap-2 rounded-2xl border border-border bg-background p-3'>
            <p className='text-xs font-semibold text-muted-foreground'>
              {t.chooseShopLabel(shopName ?? '')}
            </p>
            <div className='flex flex-wrap gap-2'>
              {destinationShops.map((shop) => (
                <Button
                  key={shop.id}
                  variant='outline'
                  size='sm'
                  disabled={isBusy}
                  onClick={() => onSelectDestination(shop.id)}
                >
                  {shop.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {pendingId && candidates.length === 0 && (
          <div className='flex flex-wrap gap-2.5 rounded-2xl border border-border bg-background p-3'>
            <Button
              variant='dark'
              size='sm'
              disabled={isBusy}
              onClick={() => onApply('CONFIRM')}
            >
              {applyCommand.isPending ? t.working : t.confirmBtn}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={isBusy}
              onClick={() => onApply('CANCEL')}
            >
              {t.cancelBtn}
            </Button>
          </div>
        )}

        {actionError && <FormError message={actionError} />}

        <div className='flex items-center gap-2.5'>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={t.inputPh}
            disabled={!shopId}
            className='h-11 flex-1 rounded-full border border-border bg-background px-5 text-sm outline-none disabled:opacity-50'
          />
          <Button
            variant='dark'
            onClick={onSend}
            disabled={sendMessage.isPending || !shopId}
          >
            {sendMessage.isPending ? t.sending : t.sendBtn}
          </Button>
        </div>

        <Caption>{t.caption}</Caption>
      </main>
    </>
  );
}
