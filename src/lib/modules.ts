"use client"

import { createCollection } from "@/lib/collection-store"
import type { Product } from "@/lib/domain/products"
import type { ContentAccount, ContentItem } from "@/lib/domain/content"

/**
 * Coleções dos módulos. Módulo novo = uma linha aqui + a tabela no SQL
 * (supabase/migrations) + as telas. Login e tempo real já cuidam do resto.
 */
export const useProducts = createCollection<Product>("products")
export const useContentAccounts = createCollection<ContentAccount>("content_accounts")
export const useContentItems = createCollection<ContentItem>("content_items")
