import orcid from '../assets/profile-icons/orcid.svg'
import github from '../assets/profile-icons/github.svg'
import googlescholar from '../assets/profile-icons/googlescholar.svg'
import linkedin from '../assets/profile-icons/linkedin.svg'
import x from '../assets/profile-icons/x.svg'

const BRAND_ICONS = { orcid, github, googlescholar, linkedin, x }

function Icon({ name, className = '' }) {
  return <span aria-hidden="true" className={'material-symbols-outlined shrink-0 text-[17px] leading-none ' + className}>{name}</span>
}

export default function ProfileIcon({ name, className = '' }) {
  const iconClassName = 'opacity-50 transition-opacity duration-150 group-hover/profile:opacity-100 group-focus-visible/profile:opacity-100 motion-reduce:transition-none ' + className
  if (name === 'openreview') {
    return <Icon name="rate_review" className={'text-red-700 ' + iconClassName} />
  }
  if (name === 'website') {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={'shrink-0 ' + iconClassName}>
      <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" />
    </svg>
  }
  return <img src={BRAND_ICONS[name]} alt="" aria-hidden="true" className={'shrink-0 object-contain ' + iconClassName} />
}
