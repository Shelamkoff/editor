import attaches from '../renderers/attaches/locale/ru.js'
import code from '../renderers/code/locale/ru.js'
import person from '../renderers/person/locale/ru.js'
import spoiler from '../renderers/spoiler/locale/ru.js'

export default {
  'renderer.carousel.label': 'Карусель материалов',
  'renderer.carousel.video': 'Видеослайд',
  'renderer.carousel.previous': 'Предыдущий слайд',
  'renderer.carousel.next': 'Следующий слайд',
  'renderer.carousel.page': 'Перейти к странице',
  'renderer.carousel.slide': 'Перейти к слайду',
  'renderer.gallery.open': 'Открыть изображение',
  'renderer.poll.selectOption': 'Выбрать вариант',
  'renderer.poll.vote': 'Проголосовать',
  'renderer.poll.loading': 'Загрузка результатов…',
  'renderer.poll.submitting': 'Отправка голоса…',
  'renderer.poll.loadError': 'Не удалось загрузить результаты опроса',
  'renderer.poll.emptyResults': 'Голосов пока нет',
  'renderer.poll.voters': 'Проголосовали',
  'renderer.poll.anonymousVoter': 'Анонимный участник',
  __lang: 'ru',
  ...attaches,
  ...code,
  ...person,
  ...spoiler,
  'renderer.embed.play': 'Воспроизвести видео',
  'renderer.embed.video': 'Видео',
}
