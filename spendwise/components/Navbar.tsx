/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Bell,
  Menu,
  User as UserIcon,
  Keyboard,
  X,
  Check,
  Clock,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useAppContext } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/axios";
import { motion, AnimatePresence } from "motion/react";

interface Notification {
  id: string;
  type: string;
  data: {
    type: string;
    user_id: string;
    user_name: string;
    user_avatar?: string;
    context_id: string;
    context_name: string;
    status: string;
    message: string;
  };
  read_at: string | null;
  created_at: string;
}

export default function Navbar() {
  const { currentContext } = useAppContext();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await api.get("/notifications");
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err: any) {
      console.log(
        "Notifications fetch error (expected if not logged in):",
        err.response?.status,
      );
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-20 transition-all">
      <div className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center space-x-6">
          <button className="md:hidden p-2 hover:bg-slate-100 rounded-xl transition">
            <Menu size={20} />
          </button>
          <div className="hidden lg:flex items-center bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl w-80 group focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white transition-all">
            <Search
              size={16}
              className="text-slate-400 group-focus-within:text-blue-500"
            />
            <input
              type="text"
              placeholder="Search everything..."
              className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-full font-medium placeholder:text-slate-400"
            />
            <div className="bg-white border border-slate-200 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-400 flex items-center gap-1 shadow-sm">
              <Keyboard size={10} />
              <span>/</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex flex-col items-end mr-4">
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">
              Live Context
            </span>
            <span className="text-sm font-extrabold text-[#636B2F] tracking-tight">
              {currentContext?.name || "Syncing..."}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block"></div>

          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2.5 text-slate-500 hover:bg-slate-50 rounded-xl relative transition group"
            >
              <Bell
                size={20}
                className="group-hover:rotate-12 transition-transform"
              />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowNotifications(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                      <h3 className="font-black text-slate-900">
                        Notifications
                      </h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-[#636B2F] font-bold hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {loading ? (
                        <div className="p-8 text-center text-slate-400">
                          Loading...
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <Bell size={24} className="mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`px-5 py-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                              !notification.read_at ? "bg-emerald-50/30" : ""
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-black text-emerald-600 flex-shrink-0">
                                {notification.data.user_name
                                  ?.charAt(0)
                                  .toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900">
                                  {notification.data.message}
                                </p>
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                  <Clock size={10} />
                                  {formatTime(notification.created_at)}
                                </p>
                              </div>
                              {!notification.read_at && (
                                <button
                                  onClick={() => markAsRead(notification.id)}
                                  className="p-1.5 hover:bg-white rounded-lg transition"
                                  title="Mark as read"
                                >
                                  <Check
                                    size={14}
                                    className="text-emerald-500"
                                  />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center space-x-4 pl-4 ml-1">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900 tracking-tight">
                {user?.name}
              </span>
              {user?.is_premium ? (
                <span className="text-[9px] bg-emerald-100 text-[#636B2F] px-2 py-0.5 rounded-full font-black uppercase tracking-widest shadow-sm shadow-emerald-100 flex items-center gap-1">
                  <Sparkles size={9} /> Pro
                </span>
              ) : (
                <Link
                  href="/pricing"
                  className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase tracking-widest hover:bg-[#636B2F] hover:text-white transition-all"
                >
                  Free
                </Link>
              )}
            </div>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#636B2F] to-[#4A5323] flex items-center justify-center text-white font-black border-4 border-white shadow-xl shadow-emerald-100 overflow-hidden text-lg ring-1 ring-slate-100">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{user?.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
