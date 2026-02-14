import { useState } from 'react';

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
}

export default function ContactModal({ open, onClose, userName, userEmail }: ContactModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  if (!open) return null;

  function handleSend() {
    const mailto = `mailto:team@gciscan.com?subject=${encodeURIComponent(subject || 'Harvex Platform Inquiry')}&body=${encodeURIComponent(
      `${message}\n\n---\nFrom: ${userName}\nEmail: ${userEmail}`
    )}`;
    window.location.href = mailto;
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setSubject('');
      setMessage('');
      onClose();
    }, 2000);
  }

  function handleClose() {
    setSent(false);
    setSubject('');
    setMessage('');
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-default px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">Contact Us</h2>
            <button onClick={handleClose} className="rounded-lg p-1 text-muted hover:text-secondary transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            {sent ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <p className="font-medium text-primary">Your email client should open now.</p>
                <p className="mt-1 text-sm text-muted">Send the message from there and we'll get back to you shortly.</p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  Questions, suggestions, or need assistance? Fill out the form below and we'll get back to you.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-secondary">Your Name</label>
                    <input
                      type="text"
                      value={userName}
                      disabled
                      className="input-field opacity-60"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-secondary">Your Email</label>
                    <input
                      type="email"
                      value={userEmail}
                      disabled
                      className="input-field opacity-60"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-secondary">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="What's this about?"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-secondary">Message</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can we help you?"
                      rows={4}
                      className="input-field resize-none"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {!sent && (
            <div className="flex items-center justify-end gap-3 border-t border-default px-5 py-3">
              <button
                onClick={handleClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-secondary transition hover-surface-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim()}
                className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue disabled:opacity-40"
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
