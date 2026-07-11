import AlertsHUD from './AlertsHUD';
import FireDangerHUD from './FireDangerHUD';

import styles from './AlertsRail.module.css';

export default function AlertsRail() {
  return (
    <div className={styles.rail}>
      <FireDangerHUD />
      <div className={styles.alerts}>
        <AlertsHUD />
      </div>
    </div>
  );
}
