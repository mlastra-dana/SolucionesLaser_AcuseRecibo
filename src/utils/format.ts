export const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
