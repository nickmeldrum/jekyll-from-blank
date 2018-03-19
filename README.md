## pre-requisites

 * Ruby (to run jekyll and gem install the dependencies)
 * Git client (to push updates to a github repo)

## Installation

Run `. script/init` to setup shell to easily run script commands.

## Commands

Note: to run any commands in a shell, you must run the `. script/init` command first to setup the shell correctly.

To run the jekyll site locally run the `local:run` command.

## TODO

### Before go live:

 * rewrite mini bio to be sensible
 * get redirects working - so the old /cv permalink redirects to /about
 * build a 404 page
 * combine this repo with the travis automation one and get it autopublishing
 * get our gtm/ga integration in
 * improve logo/ header nav look and feel
 * sort out permalinks - add permalink variable to disqus? - what else is permalink important for? canonical/ google webmaster tools?
 * check all old posts - missing imgs, broken tags etc.
 * fix responsive width for svg in decorator post
 * check responsive width for all old posts is working
 * get a better li style

### Maybe before?

 * test disqus commenting
 * the scripts in the decorators post!
 * rewrite cv page content for my new profile
 * older/newer, next/prev - are they in the right direction? (check medium?)
 * get proper color scheme - base link colors/ other site colors/ favicon and brand logo on them

### After go live:

 * get proper quotes in text
 * add "share" links at bottom of post page?
 * get all the weird head attributes we need in nowadays
 * add tests using html proofer
 * get twitter plugin in
 * get search in
 * get my header image in and parallax scrolling (css only)
 * create a dark theme switch
 * look at gradual font improvement on load (currently waits for css/ fonts to download before rendering)
