export class Inflate {
  push() {
    return true;
  }
}

const zlibSyncShim = {
  Inflate,
};

export default zlibSyncShim;
