import {useEffect, useRef, useState} from 'react';
import {Building2Icon, ClockIcon, LockIcon, PhoneIcon, ShieldCheckIcon, XIcon} from 'lucide-react';

import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button as AxButton} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Markdown} from '@astryxdesign/core/Markdown';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {useStreamingText} from '@astryxdesign/core/hooks';

import {Button} from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {useMediaQuery} from '@/hooks/useMediaQuery';
import {ARTICLES, ask, CONTACTS, formatDate, isCurrent, ROLES, SUGGESTIONS, type Contact, type Reply, type Role} from '@/navigator/knowledge';
import {modelLabel, parseMark, streamAnswer, visibleText, type Turn} from '@/navigator/llm';

type Msg =
  | {id: number; sender: 'user'; text: string}
  | {id: number; sender: 'assistant'; reply: Reply | null; animate: boolean}
  | {id: number; sender: 'llm'; raw: string; done: boolean; model: string; role: Role}
  | {id: number; sender: 'system'; text: string};

let nextId = 1;

export function NavigatorChat({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const wide = useMediaQuery('(min-width: 768px)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [role, setRole] = useState<Role>('worker');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{id: 0, sender: 'assistant', reply: null, animate: false}]);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = (id: number, fn: (m: Msg) => Msg | null) =>
    setMessages((list) => list.flatMap((m) => (m.id === id ? (fn(m) ?? []) : [m])));

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setDraft('');
    // история для модели: вопросы и уже показанные ответы модели (без служебной метки)
    const history: Turn[] = messages.flatMap((m): Turn[] =>
      m.sender === 'user' ? [{role: 'user', content: m.text}] : m.sender === 'llm' && m.done ? [{role: 'assistant', content: visibleText(m.raw)}] : [],
    );
    history.push({role: 'user', content: q});
    const id = nextId++;
    setMessages((m) => [...m, {id: nextId++, sender: 'user', text: q}, {id, sender: 'llm', raw: '', done: false, model: '', role}]);
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const {model} = await streamAnswer({
        role,
        history,
        signal: abort.signal,
        onText: (raw) => patch(id, (m) => ({...m, raw}) as Msg),
        onThinking: () => {},
      });
      patch(id, (m) => ({...m, done: true, model}) as Msg);
    } catch (err) {
      if (abort.signal.aborted) {
        patch(id, (m) => (m.sender === 'llm' && m.raw ? {...m, done: true} : null));
      } else {
        // модель недоступна — отвечаем по локальной базе знаний, чтобы сотрудник не остался без ответа
        console.warn('[navigator] fallback to local knowledge base:', err);
        patch(id, () => ({id, sender: 'assistant', reply: ask(q, role), animate: !reduced}));
        setMessages((m) => [...m, {id: nextId++, sender: 'system', text: 'Нейросеть сейчас недоступна — ответ из базы знаний'}]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const changeRole = (value: string) => {
    const r = value as Role;
    if (r === role) return;
    setRole(r);
    setMessages((m) => [...m, {id: nextId++, sender: 'system', text: `Профиль доступа: ${ROLES[r].label} — ответы учитывают эти права`}]);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection={wide ? 'right' : 'down'}>
      <DrawerContent className="data-[swipe-axis=x]:sm:[--drawer-content-width:var(--container-lg)] data-[swipe-axis=y]:[--drawer-content-height:92dvh]">
        <DrawerHeader className="gap-3 border-b border-border pb-3 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <HStack gap={3} vAlign="center">
            <Avatar name="Навигатор" size="md" />
            <VStack gap={0} width="100%">
              <DrawerTitle className="text-base font-semibold">Навигатор компании</DrawerTitle>
              <DrawerDescription className="text-xs">Отвечает нейросеть по базе знаний компании · данные демо</DrawerDescription>
            </VStack>
            <DrawerClose render={<Button variant="ghost" size="icon" aria-label="Закрыть навигатор" />}>
              <XIcon />
            </DrawerClose>
          </HStack>
          <VStack gap={1}>
            <Text type="supporting">Кто спрашивает — от этого зависят доступные ответы</Text>
            <SegmentedControl value={role} onChange={changeRole} label="Профиль доступа" size="sm" layout="fill">
              {(Object.keys(ROLES) as Role[]).map((r) => (
                <SegmentedControlItem key={r} value={r} label={ROLES[r].label} />
              ))}
            </SegmentedControl>
          </VStack>
        </DrawerHeader>

        <VStack className="min-h-0 flex-1">
          <ChatLayout
            density="compact"
            className="min-h-0 flex-1"
            composer={
              <ChatComposer
                onSubmit={send}
                value={draft}
                onChange={setDraft}
                isStopShown={busy}
                onStop={() => abortRef.current?.abort()}
                placeholder="Например: как получить справку 2-НДФЛ?"
                input={<ChatComposerInput label="Вопрос навигатору" maxRows={4} hasHistory={false} />}
              />
            }>
            <ChatMessageList density="compact" isStreaming={busy}>
              {messages.map((m) => {
                if (m.sender === 'system')
                  return (
                    <ChatSystemMessage key={m.id} icon={<Icon icon={ShieldCheckIcon} size="sm" color="secondary" />}>
                      {m.text}
                    </ChatSystemMessage>
                  );
                if (m.sender === 'llm')
                  return (
                    <ChatMessage key={m.id} sender="assistant" avatar={<Avatar name="Навигатор" size="sm" />}>
                      <LlmAnswer msg={m} />
                    </ChatMessage>
                  );
                if (m.sender === 'user')
                  return (
                    <ChatMessage key={m.id} sender="user">
                      <ChatMessageBubble>{m.text}</ChatMessageBubble>
                    </ChatMessage>
                  );
                return (
                  <ChatMessage key={m.id} sender="assistant" avatar={<Avatar name="Навигатор" size="sm" />}>
                    {m.reply === null ? <Greeting role={role} onPick={send} /> : <Answer reply={m.reply} animate={m.animate} onPick={send} />}
                  </ChatMessage>
                );
              })}
            </ChatMessageList>
          </ChatLayout>
        </VStack>
      </DrawerContent>
    </Drawer>
  );
}

function Greeting({role, onPick}: {role: Role; onPick: (q: string) => void}) {
  return (
    <>
      <ChatMessageBubble variant="ghost">
        <Markdown density="compact">
          {`Здравствуйте! Я подскажу, **куда обратиться** и что подготовить: кадры, бухгалтерия, юристы, техподдержка, пропуска и кабинеты.\n\nПоказываю только действующие документы — для профиля «${ROLES[role].label}».`}
        </Markdown>
      </ChatMessageBubble>
      <ChatMessageBubble variant="ghost" width="100%">
        <HStack gap={1} wrap="wrap">
          {SUGGESTIONS.map((s) => (
            <AxButton key={s} label={s} size="sm" variant="secondary" onClick={() => onPick(s)} />
          ))}
        </HStack>
      </ChatMessageBubble>
    </>
  );
}

function Answer({reply, animate, onPick}: {reply: Reply; animate: boolean; onPick: (q: string) => void}) {
  if (reply.kind === 'unknown') {
    return (
      <>
        <ChatMessageBubble variant="ghost">
          <Markdown density="compact">
            {'Готового ответа в базе пока нет. Попробуйте сформулировать иначе или выберите тему — а если вопрос срочный, справочная служба соединит с нужным отделом: **вн. 1000**.'}
          </Markdown>
        </ChatMessageBubble>
        <ChatMessageBubble variant="ghost" width="100%">
          <HStack gap={1} wrap="wrap">
            {SUGGESTIONS.slice(0, 4).map((s) => (
              <AxButton key={s} label={s} size="sm" variant="secondary" onClick={() => onPick(s)} />
            ))}
          </HStack>
        </ChatMessageBubble>
      </>
    );
  }
  if (reply.kind === 'route') {
    return (
      <>
        <ChatMessageBubble variant="ghost">
          <Markdown density="compact">{`С этим вопросом поможет **${reply.contact.service.toLowerCase()}**. Вот куда идти:`}</Markdown>
        </ChatMessageBubble>
        <ContactBubble contact={reply.contact} />
      </>
    );
  }
  if (reply.kind === 'restricted') {
    return (
      <>
        <ChatMessageBubble variant="ghost">
          <HStack gap={2} vAlign="start">
            <Icon icon={LockIcon} size="sm" color="secondary" />
            <Markdown density="compact">
              {`Инструкция «${reply.article.title}» доступна профилям: ${reply.article.roles.map((r) => ROLES[r].label).join(', ')}. С вашим доступом подскажет ${reply.contact.service.toLowerCase()} или непосредственный руководитель.`}
            </Markdown>
          </HStack>
        </ChatMessageBubble>
        <ContactBubble contact={reply.contact} />
      </>
    );
  }
  const {article, contact, hiddenOutdated} = reply;
  return (
    <>
      <StreamedAnswer text={article.answer} animate={animate} />
      <ContactBubble contact={contact} />
      <ChatMessageMetadata
        footer={
          <Text type="supporting">
            {`Актуально на ${formatDate(article.updated)} · владелец: ${contact.service}`}
            {hiddenOutdated > 0 ? ` · устаревших документов скрыто: ${hiddenOutdated}` : ''}
          </Text>
        }
      />
    </>
  );
}

function LlmAnswer({msg}: {msg: Extract<Msg, {sender: 'llm'}>}) {
  const text = visibleText(msg.raw);
  if (!text) {
    return (
      <ChatMessageBubble variant="ghost">
        <Text type="supporting">Навигатор думает…</Text>
      </ChatMessageBubble>
    );
  }
  const {source, service} = msg.done ? parseMark(msg.raw) : {source: null, service: null};
  // дату актуальности показываем, только если модель сослалась на действующую статью, открытую профилю
  const article = ARTICLES.find((a) => a.id === source && isCurrent(a) && a.roles.includes(msg.role));
  const meta = [article && `Актуально на ${formatDate(article.updated)}`, msg.model && `Ответ: ${modelLabel(msg.model)}`].filter(Boolean).join(' · ');
  return (
    <>
      <ChatMessageBubble variant="ghost">
        <Markdown density="compact" isStreaming={!msg.done}>
          {text}
        </Markdown>
      </ChatMessageBubble>
      {service && <ContactBubble contact={CONTACTS[service]} />}
      {msg.done && meta && <ChatMessageMetadata footer={<Text type="supporting">{meta}</Text>} />}
    </>
  );
}

function StreamedAnswer({text, animate}: {text: string; animate: boolean}) {
  const [streaming, setStreaming] = useState(animate);
  const displayedText = useStreamingText(text, streaming, {speed: 'fast'});
  useEffect(() => {
    if (streaming && displayedText === text) setStreaming(false);
  }, [displayedText, streaming, text]);
  return (
    <ChatMessageBubble variant="ghost">
      <Markdown density="compact" isStreaming={streaming}>
        {displayedText}
      </Markdown>
    </ChatMessageBubble>
  );
}

function ContactBubble({contact}: {contact: Contact}) {
  return (
    <ChatMessageBubble variant="ghost" width="100%">
      <Card variant="muted" padding={3} maxWidth={420}>
        <VStack gap={2}>
          <HStack gap={3} vAlign="center">
            <Avatar name={contact.person} size="md" tooltip={false} />
            <VStack gap={0}>
              <Text type="label" weight="semibold">
                {contact.person}
              </Text>
              <Text type="supporting">{`${contact.position} · ${contact.service}`}</Text>
            </VStack>
          </HStack>
          <ContactRow icon={Building2Icon} text={contact.room} />
          <ContactRow icon={PhoneIcon} text={contact.phone} />
          <ContactRow icon={ClockIcon} text={contact.hours} />
        </VStack>
      </Card>
    </ChatMessageBubble>
  );
}

function ContactRow({icon, text}: {icon: typeof PhoneIcon; text: string}) {
  return (
    <HStack gap={2} vAlign="center">
      <Icon icon={icon} size="sm" color="accent" />
      <Text type="body">{text}</Text>
    </HStack>
  );
}

