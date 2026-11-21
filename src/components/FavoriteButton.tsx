import { useState, type MouseEvent } from 'react'
import { ApiError } from '../api/client'
import { useFavorites } from '../favorites/FavoritesContext'

export function FavoriteButton({ productId, productName, className = '' }: { productId: number; productName: string; className?: string }) {
  const { productIds, loading, toggleFavorite } = useFavorites()
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const isFavorite = productIds.has(productId)

  async function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (pending) return
    setPending(true)
    setFeedback('')
    try {
      const result = await toggleFavorite(productId)
      if (result === 'added') setFeedback(`${productName} foi adicionado aos favoritos.`)
      else if (result === 'removed') setFeedback(`${productName} foi removido dos favoritos.`)
      else if (result === 'conflict') setFeedback(`${productName} já está nos favoritos.`)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return
      setFeedback(`Não foi possível atualizar os favoritos de ${productName}. Tente novamente.`)
    } finally { setPending(false) }
  }

  return <span className="favorite-control-wrap">
    <button
      type="button"
      className={`favorite-toggle ${className}`.trim()}
      aria-label={pending ? `Atualizando favoritos de ${productName}` : `${isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${productName}`}
      aria-pressed={isFavorite}
      disabled={pending || loading}
      onClick={(event) => void toggle(event)}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg>
      <span className="visually-hidden">{pending ? 'Atualizando favoritos' : isFavorite ? 'Favoritado' : 'Favoritar'}</span>
    </button>
    {feedback && <span className="favorite-feedback" role="status">{feedback}</span>}
  </span>
}
