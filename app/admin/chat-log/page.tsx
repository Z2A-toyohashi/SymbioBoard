'use client';

import { useEffect, useState } from 'react';
import ChatLog from '@/components/admin/ChatLog';
import AdminHeader from '@/components/admin/AdminHeader';

interface ChatMessage {
  id: string;
  user_id: string;
  role: string;
  content: string;
  media_url?: string;
  media_type?: string;
  created_at: number;
}

export default function ChatLogPage() {
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const chatRes = await fetch('/api/chat-messages');
      const chatData = await chatRes.json();
      setChatMessages(chatData.messages || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen mz-paper flex items-center justify-center">
        <div className="w-8 h-8 border mz-border border-t-gray-900 animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen mz-paper">
      <AdminHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 mt-4 sm:mt-6 mb-8">
        <ChatLog messages={chatMessages} />
      </main>
    </div>
  );
}
