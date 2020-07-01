#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')]  $1"
}

command=$1

yarn_v=$(yarn --version)
log "Using yarn version: ${yarn_v}"

# Assume it will fail
retcode=1

case $command in
    "lint")
    log "Running Lint"
    yarn run lint
    retcode=$?
    log "Lint gave return code: $?"
    ;;
    "test")
    log "Running Tests"
    yarn test  2>&1 | tee output/buidler.log
    retcode=${PIPESTATUS[0]}
    log "Buidler gave return code: $retcode"
    ;;
    *)
    echo "Please use lint|test"
    ;;
esac


exit $retcode