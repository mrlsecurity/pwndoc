import Utils from '@/services/utils'

function renderLegendText(label, alt) {
  return [label, alt].filter(Boolean).join(' - ')
}

export function resolveEditorImageSrc(src) {
  return /^[a-fA-F0-9]{24}$/.test(src || '')
    ? `/api/images/download/${src}`
    : src
}

export function normalizeEditorHtml(html) {
  const clean = Utils.htmlEncode(String(html || ''))
  if (!clean) return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(clean, 'text/html')

  doc.body.querySelectorAll('legend').forEach((legend) => {
    const label = legend.getAttribute('label') || ''
    const alt = legend.getAttribute('alt') || ''
    const visibleCaption = renderLegendText(label, alt)
    if (visibleCaption && !legend.textContent.trim()) {
      legend.textContent = visibleCaption
    }
    legend.removeAttribute('label')
    legend.removeAttribute('alt')
    legend.removeAttribute('commentid')
  })

  doc.body.querySelectorAll('img').forEach((img) => {
    const figure = doc.createElement('figure')
    const normalizedImg = doc.createElement('img')
    const caption = doc.createElement('figcaption')
    const alt = img.getAttribute('alt') || ''

    figure.className = 'draft-image'
    normalizedImg.setAttribute('src', resolveEditorImageSrc(img.getAttribute('src') || ''))
    normalizedImg.setAttribute('alt', '')
    caption.textContent = alt

    figure.appendChild(normalizedImg)
    if (alt) figure.appendChild(caption)
    img.replaceWith(figure)
  })

  return doc.body.innerHTML
}
