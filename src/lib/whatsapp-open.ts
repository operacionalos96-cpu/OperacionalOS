"use client"

import { useEffect, useState } from "react"
import { whatsappUrl, type WhatsappTarget } from "@/lib/domain/contact"

/**
 * Abre a conversa com a empresa no WhatsApp escolhido (lembrado neste navegador):
 * - web: WhatsApp Web direto na conversa, SEMPRE na mesma aba (não abre uma aba por lead);
 * - app: WhatsApp instalado no computador;
 * - celular: wa.me (no celular abre o app).
 */
const KEY = "operacional:whatsapp-destino"
const TAB = "operacional-whatsapp"

const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export function getWhatsappTarget(): WhatsappTarget {
  try {
    const v = localStorage.getItem(KEY)
    if (v === "web" || v === "app" || v === "celular") return v
  } catch {}
  return isMobile() ? "celular" : "web"
}

export function useWhatsappTarget() {
  const [target, setTarget] = useState<WhatsappTarget>("web")
  useEffect(() => setTarget(getWhatsappTarget()), [])
  const change = (t: WhatsappTarget) => {
    setTarget(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {}
  }
  return [target, change] as const
}

/** true = abriu. false = número inválido. */
export function openWhatsapp(contact: string | undefined, text = "", target = getWhatsappTarget()) {
  const url = whatsappUrl(contact, text, target)
  if (!url) return false
  if (target === "app") {
    window.location.href = url // abre o aplicativo (protocolo whatsapp://), sem aba nova
  } else if (target === "web") {
    const w = window.open(url, TAB) // aba nomeada: a mesma é reaproveitada a cada lead
    if (w) w.opener = null
  } else {
    window.open(url, "_blank", "noopener,noreferrer")
  }
  return true
}
